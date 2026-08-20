import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateCutoffDto } from './dto/create-cutoff.dto';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { AuditActorContext, AuditLogService } from 'src/audit-log/audit-log.service';

@Injectable()
export class PayrollService implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit() {
    try {
      await this.db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'tblpayroll_daily_records'
              AND column_name = 'overtime'
          ) THEN
            ALTER TABLE tblpayroll_daily_records ADD COLUMN overtime NUMERIC DEFAULT 0;
          END IF;
        END $$;
      `);
    } catch (error) {
      console.error('PayrollService: Failed to ensure overtime column:', error?.message);
    }
  }

  async getEmployees(filters: { position?: string; projectId?: number }) {
    const conditions: string[] = ['status = 1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.position) {
      conditions.push(`position = $${paramIndex++}`);
      params.push(filters.position);
    }

    if (filters.projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(filters.projectId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.query<{
      id: number;
      fullName: string;
      position: string;
      projectId: number | null;
      baseSalary: number;
      pagIbig: number;
      philhealth: number;
      sss: number;
      contactNumber: string | null;
      address: string | null;
      department: string;
      status: number;
      createdAt: string;
    }>(
      `SELECT
         id,
         full_name AS "fullName",
         position,
         project_id AS "projectId",
         base_salary::numeric AS "baseSalary",
         pag_ibig::numeric AS "pagIbig",
         philhealth::numeric AS "philhealth",
         sss::numeric AS "sss",
         contact_number AS "contactNumber",
         address,
         department,
         status,
         created_at AS "createdAt"
       FROM tblpayroll_employees
       ${whereClause}
       ORDER BY full_name ASC`,
      params,
    );

    return result.rows;
  }

  private static readonly ALLOWED_DEPARTMENTS = [
    'Driver',
    'Installer',
    'Helper',
    'Office',
    'Project Assigned',
  ];

  async createEmployee(dto: CreateEmployeeDto, userId?: number, auditActor?: AuditActorContext) {
    const fullName = String(dto.fullName ?? '').trim();
    const position = String(dto.position ?? '').trim();
    const baseSalary = Number(dto.baseSalary);

    if (!fullName) {
      throw new BadRequestException('fullName is required');
    }
    if (!position) {
      throw new BadRequestException('position is required');
    }
    if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
      throw new BadRequestException('baseSalary must be greater than 0');
    }

    // Department validation (service-level safety net)
    const department = String(dto.department ?? '').trim();
    if (!department) {
      throw new BadRequestException('department is required');
    }
    if (!PayrollService.ALLOWED_DEPARTMENTS.includes(department)) {
      throw new BadRequestException(
        'department must be one of: Driver, Installer, Helper, Office, Project Assigned',
      );
    }

    // Government deductions non-negative validation
    const pagIbig = Number(dto.pagIbig ?? 0);
    const philhealth = Number(dto.philhealth ?? 0);
    const sss = Number(dto.sss ?? 0);

    if (pagIbig < 0) {
      throw new BadRequestException('pagIbig must be >= 0');
    }
    if (philhealth < 0) {
      throw new BadRequestException('philhealth must be >= 0');
    }
    if (sss < 0) {
      throw new BadRequestException('sss must be >= 0');
    }

    const contactNumber = dto.contactNumber ?? null;
    const address = dto.address ?? null;

    const result = await this.db.query<{
      id: number;
      fullName: string;
      position: string;
      projectId: number | null;
      baseSalary: number;
      pagIbig: number;
      philhealth: number;
      sss: number;
      contactNumber: string | null;
      address: string | null;
      department: string;
      status: number;
      createdAt: string;
    }>(
      `INSERT INTO tblpayroll_employees (full_name, position, project_id, base_salary, pag_ibig, philhealth, sss, contact_number, address, department, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING
         id,
         full_name AS "fullName",
         position,
         project_id AS "projectId",
         base_salary::numeric AS "baseSalary",
         pag_ibig::numeric AS "pagIbig",
         philhealth::numeric AS "philhealth",
         sss::numeric AS "sss",
         contact_number AS "contactNumber",
         address,
         department,
         status,
         created_at AS "createdAt"`,
      [fullName, position, dto.projectId ?? null, baseSalary, pagIbig, philhealth, sss, contactNumber, address, department, userId ?? null],
    );

    const created = result.rows[0];
    await this.auditLogService.logMutation({
      action: 'PAYROLL_EMPLOYEE_CREATE',
      entityType: 'payroll-employee',
      entityId: created?.id,
      actor: auditActor ?? { userId },
      description: `Created payroll employee ${fullName}`,
      requestBody: dto as unknown as Record<string, unknown>,
      after: created as unknown as Record<string, unknown>,
    });

    return created;
  }

  // async getEmployeeCutoffs(employeeId: number) {
  //   const result = await this.db.query<{
  //     id: number;
  //     recordId: number;
  //     cutoffStart: string;
  //     cutoffEnd: string;
  //     payoutAmount: number;
  //     generatedAt: string;
  //   }>(
  //     `SELECT
  //        c.id,
  //        r.id AS "recordId",
  //        c.cutoff_start AS "cutoffStart",
  //        c.cutoff_end AS "cutoffEnd",
  //        r.payout_amount::numeric AS "payoutAmount",
  //        r.generated_at AS "generatedAt"
  //      FROM tblpayroll_records r
  //      JOIN tblpayroll_cutoffs c ON c.id = r.cutoff_id
  //      WHERE r.employee_id = $1
  //      ORDER BY c.cutoff_start DESC`,
  //     [employeeId],
  //   );

  //   return result.rows;
  // }
  async getEmployeeCutoffs(employeeId: number) {
    const result = await this.db.query<{
      id: number;
      recordId: number;
      cutoffStart: string;
      cutoffEnd: string;
      generatedAt: string;
    }>(
      `SELECT
        c.id,
        r.id AS "recordId",
        c.cutoff_start AS "cutoffStart",
        c.cutoff_end AS "cutoffEnd",
        r.generated_at AS "generatedAt"
      FROM tblpayroll_records r
      JOIN tblpayroll_cutoffs c ON c.id = r.cutoff_id
      WHERE r.employee_id = $1
      ORDER BY c.cutoff_start DESC`,
      [employeeId],
    );

    // Define the shape of your cutoff record
    type CutoffRecord = {
      id: number;
      recordId: number;
      cutoffStart: string;
      cutoffEnd: string;
      generatedAt: string;
      payoutAmount: number;
    };


    const cutoffs: CutoffRecord[] = [];

    for (const rec of result.rows) {
      const computedPayout = await this.computePayout(rec.recordId);
      cutoffs.push({
        ...rec,
        payoutAmount: computedPayout,
      });
    }

    return cutoffs;
  }

  // payroll.service.ts

  async computePayout(recordId: number): Promise<number> {
    // 1. Daily records - use adjusted_rate, overtime, and is_present from daily records
    const dailyRecordsResult = await this.db.query<{ adjustedRate: number; isPresent: boolean; commission: number; overtime: number }>(
      `SELECT dr.adjusted_rate::numeric AS "adjustedRate",
              dr.is_present AS "isPresent",
              dr.commission::numeric AS "commission",
              COALESCE(dr.overtime, 0)::numeric AS "overtime"
      FROM tblpayroll_daily_records dr
      WHERE dr.payroll_record_id = $1`,
      [recordId],
    );

    // 2. Additional compensation
    const compensationResult = await this.db.query<{ amount: number }>(
      `SELECT amount::numeric FROM tblpayroll_additional_compensation WHERE payroll_record_id = $1`,
      [recordId],
    );

    // 3. Additional deductions
    const deductionsResult = await this.db.query<{ amount: number }>(
      `SELECT amount::numeric FROM tblpayroll_additional_deductions WHERE payroll_record_id = $1`,
      [recordId],
    );

    // 4. Government deductions
    const govResult = await this.db.query<{
      pagIbigUsed: number;
      philhealthUsed: number;
      sssUsed: number;
    }>(
      `SELECT pag_ibig_used::numeric AS "pagIbigUsed",
              philhealth_used::numeric AS "philhealthUsed",
              sss_used::numeric AS "sssUsed"
      FROM tblpayroll_records
      WHERE id = $1`,
      [recordId],
    );

    const gov = govResult.rows[0];

    // 5. Compute totals - sum adjustedRate and overtime only for present days
    const presentDays = dailyRecordsResult.rows.filter(dr => dr.isPresent);
    const totalAdjustedRate = presentDays.reduce((sum, dr) => sum + Number(dr.adjustedRate ?? 0), 0);
    const totalOvertime = presentDays.reduce((sum, dr) => sum + Number(dr.overtime ?? 0), 0);
    const totalCommissions = presentDays.reduce((sum, dr) => sum + Number(dr.commission ?? 0), 0);
    const totalAdditionalCompensation = compensationResult.rows.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
    const totalAdditionalDeductions = deductionsResult.rows.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
    const totalGovernmentDeductions =
      Number(gov?.pagIbigUsed ?? 0) +
      Number(gov?.philhealthUsed ?? 0) +
      Number(gov?.sssUsed ?? 0);

    return (
      totalAdjustedRate +
      totalOvertime +
      totalCommissions +
      totalAdditionalCompensation -
      totalAdditionalDeductions -
      totalGovernmentDeductions
    );
  }

  async getEmployeeSummary(employeeId: number): Promise<{
    generatedPayrollCount: number;
    currentPayout: number;
    totalPayout: number;
  }> {
    // 1. Get all payroll records for employee
    const recordsResult = await this.db.query<{ id: number; generatedAt: string }>(
      `SELECT id, generated_at AS "generatedAt"
      FROM tblpayroll_records
      WHERE employee_id = $1
      ORDER BY generated_at DESC`,
      [employeeId],
    );

    const records = recordsResult.rows;

    if (records.length === 0) {
      return { generatedPayrollCount: 0, currentPayout: 0, totalPayout: 0 };
    }

    // 2. Compute payouts for all records
    const payouts = await Promise.all(records.map(r => this.computePayout(r.id)));
    const totalPayout = payouts.reduce((sum, p) => sum + p, 0);

    // 3. Filter current month records
    const now = new Date();
    const currentMonthRecords = records.filter(r => {
      const d = new Date(r.generatedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const currentPayouts = await Promise.all(currentMonthRecords.map(r => this.computePayout(r.id)));
    const currentPayout = currentPayouts.reduce((sum, p) => sum + p, 0);

    // 4. Return summary
    return {
      generatedPayrollCount: records.length,
      currentPayout,   // computed for current month
      totalPayout,     // computed for all records
    };
  }

  // async getEmployeeSummary(employeeId: number): Promise<{
  //   generatedPayrollCount: number;
  //   currentPayout: number;
  //   totalPayout: number;
  // }> {
  //   const result = await this.db.query<{
  //     generatedPayrollCount: string;
  //     totalPayout: string | null;
  //   }>(
  //     `SELECT
  //        COUNT(*)::text AS "generatedPayrollCount",
  //        SUM(payout_amount)::text AS "totalPayout"
  //      FROM tblpayroll_records
  //      WHERE employee_id = $1`,
  //     [employeeId],
  //   );

  //   const row = result.rows[0];
  //   const count = parseInt(row.generatedPayrollCount, 10) || 0;
  //   const total = parseFloat(row.totalPayout ?? '0') || 0;

  //   if (count === 0) {
  //     return { generatedPayrollCount: 0, currentPayout: 0, totalPayout: 0 };
  //   }

  //   const currentResult = await this.db.query<{ payoutAmount: string }>(
  //     `SELECT payout_amount::text AS "payoutAmount"
  //      FROM tblpayroll_records
  //      WHERE employee_id = $1
  //      ORDER BY generated_at DESC
  //      LIMIT 1`,
  //     [employeeId],
  //   );

  //   const currentPayout = parseFloat(currentResult.rows[0]?.payoutAmount ?? '0') || 0;

  //   return {
  //     generatedPayrollCount: count,
  //     currentPayout,
  //     totalPayout: total,
  //   };
  // }

  async getCutoffDetail(cutoffId: number) {
    // First query the cutoff info
    const cutoffResult = await this.db.query<{
      id: number;
      cutoffStart: string;
      cutoffEnd: string;
      createdAt: string;
    }>(
      `SELECT
         id,
         cutoff_start AS "cutoffStart",
         cutoff_end AS "cutoffEnd",
         created_at AS "createdAt"
       FROM tblpayroll_cutoffs
       WHERE id = $1`,
      [cutoffId],
    );

    if (cutoffResult.rows.length === 0) {
      throw new NotFoundException('Cutoff not found');
    }

    const cutoff = cutoffResult.rows[0];

    // Then query the associated records with employee names
    const recordsResult = await this.db.query<{
      employeeId: number;
      employeeName: string;
      baseSalaryUsed: number;
      payoutAmount: number;
      generatedAt: string;
    }>(
      `SELECT
         r.employee_id AS "employeeId",
         e.full_name AS "employeeName",
         r.base_salary_used::numeric AS "baseSalaryUsed",
         r.payout_amount::numeric AS "payoutAmount",
         r.generated_at AS "generatedAt"
       FROM tblpayroll_records r
       JOIN tblpayroll_employees e ON e.id = r.employee_id
       WHERE r.cutoff_id = $1`,
      [cutoffId],
    );

    return {
      ...cutoff,
      records: recordsResult.rows,
    };
  }

  async createCutoff(dto: CreateCutoffDto, userId?: number, auditActor?: AuditActorContext) {
    // Validate cutoffEnd >= cutoffStart
    if (dto.cutoffEnd < dto.cutoffStart) {
      throw new BadRequestException('cutoffEnd must be greater than or equal to cutoffStart');
    }

    // Validate employeeIds is non-empty
    if (!dto.employeeIds || dto.employeeIds.length === 0) {
      throw new BadRequestException('employeeIds must contain at least one employee');
    }

    // Check for overlapping cutoff periods for the same employees
    const placeholders = dto.employeeIds.map((_, i) => `$${i + 3}`).join(', ');
    const overlapResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM tblpayroll_records r
       JOIN tblpayroll_cutoffs c ON c.id = r.cutoff_id
       WHERE r.employee_id IN (${placeholders})
         AND c.cutoff_start <= $1
         AND c.cutoff_end >= $2`,
      [dto.cutoffEnd, dto.cutoffStart, ...dto.employeeIds],
    );

    if (parseInt(overlapResult.rows[0].count, 10) > 0) {
      throw new ConflictException('Cutoff period overlaps with existing payroll for selected employees');
    }

    // Insert into tblpayroll_cutoffs
    const cutoffResult = await this.db.query<{
      id: number;
      cutoffStart: string;
      cutoffEnd: string;
      createdAt: string;
    }>(
      `INSERT INTO tblpayroll_cutoffs (cutoff_start, cutoff_end, created_by)
       VALUES ($1, $2, $3)
       RETURNING
         id,
         cutoff_start AS "cutoffStart",
         cutoff_end AS "cutoffEnd",
         created_at AS "createdAt"`,
      [dto.cutoffStart, dto.cutoffEnd, userId ?? null],
    );

    const cutoff = cutoffResult.rows[0];

    // For each employee, get their current base_salary and create a payroll record
    const records: Array<{
      employeeId: number;
      baseSalaryUsed: number;
      payoutAmount: number;
      generatedAt: string;
    }> = [];

    for (const employeeId of dto.employeeIds) {
      // Get current base_salary from tblpayroll_employees
      const empResult = await this.db.query<{ baseSalary: string }>(
        `SELECT base_salary::text AS "baseSalary"
         FROM tblpayroll_employees
         WHERE id = $1 AND status = 1`,
        [employeeId],
      );

      if (empResult.rows.length === 0) {
        throw new NotFoundException(`Employee with id ${employeeId} not found or inactive`);
      }

      const baseSalaryUsed = parseFloat(empResult.rows[0].baseSalary);
      const payoutAmount = baseSalaryUsed; // Simple 1:1 for now

      // Insert into tblpayroll_records
      const recordResult = await this.db.query<{
        employeeId: number;
        baseSalaryUsed: number;
        payoutAmount: number;
        generatedAt: string;
      }>(
        `INSERT INTO tblpayroll_records (employee_id, cutoff_id, base_salary_used, payout_amount)
         VALUES ($1, $2, $3, $4)
         RETURNING
           employee_id AS "employeeId",
           base_salary_used::numeric AS "baseSalaryUsed",
           payout_amount::numeric AS "payoutAmount",
           generated_at AS "generatedAt"`,
        [employeeId, cutoff.id, baseSalaryUsed, payoutAmount],
      );

      records.push(recordResult.rows[0]);
    }

    const createdCutoff = {
      ...cutoff,
      records,
    };
    await this.auditLogService.logMutation({
      action: 'PAYROLL_CUTOFF_CREATE',
      entityType: 'payroll-cutoff',
      entityId: cutoff.id,
      actor: auditActor ?? { userId },
      description: `Created payroll cutoff #${cutoff.id}`,
      requestBody: dto as unknown as Record<string, unknown>,
      after: createdCutoff as unknown as Record<string, unknown>,
    });

    return createdCutoff;
  }

  async updateEmployee(id: number, dto: UpdateEmployeeDto, auditActor?: AuditActorContext) {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dto.fullName !== undefined) {
      const trimmed = String(dto.fullName).trim();
      if (!trimmed) {
        throw new BadRequestException('fullName must not be empty');
      }
      setClauses.push(`full_name = $${paramIndex++}`);
      params.push(trimmed);
    }

    if (dto.position !== undefined) {
      const trimmed = String(dto.position).trim();
      if (!trimmed) {
        throw new BadRequestException('position must not be empty');
      }
      setClauses.push(`position = $${paramIndex++}`);
      params.push(trimmed);
    }

    if (dto.projectId !== undefined) {
      setClauses.push(`project_id = $${paramIndex++}`);
      params.push(dto.projectId);
    }

    if (dto.baseSalary !== undefined) {
      const salary = Number(dto.baseSalary);
      if (!Number.isFinite(salary) || salary <= 0) {
        throw new BadRequestException('baseSalary must be greater than 0');
      }
      setClauses.push(`base_salary = $${paramIndex++}`);
      params.push(salary);
    }

    if (dto.department !== undefined) {
      const validDepartments = ['Driver', 'Installer', 'Helper', 'Office', 'Project Assigned'];
      if (!validDepartments.includes(dto.department)) {
        throw new BadRequestException('department must be one of: Driver, Installer, Helper, Office, Project Assigned');
      }
      setClauses.push(`department = $${paramIndex++}`);
      params.push(dto.department);
    }

    if (dto.pagIbig !== undefined) {
      const value = Number(dto.pagIbig);
      if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException('pagIbig must be >= 0');
      }
      setClauses.push(`pag_ibig = $${paramIndex++}`);
      params.push(value);
    }

    if (dto.philhealth !== undefined) {
      const value = Number(dto.philhealth);
      if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException('philhealth must be >= 0');
      }
      setClauses.push(`philhealth = $${paramIndex++}`);
      params.push(value);
    }

    if (dto.sss !== undefined) {
      const value = Number(dto.sss);
      if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException('sss must be >= 0');
      }
      setClauses.push(`sss = $${paramIndex++}`);
      params.push(value);
    }

    if (dto.contactNumber !== undefined) {
      setClauses.push(`contact_number = $${paramIndex++}`);
      params.push(dto.contactNumber);
    }

    if (dto.address !== undefined) {
      setClauses.push(`address = $${paramIndex++}`);
      params.push(dto.address);
    }

    // Always set updated_at on update
    setClauses.push(`updated_at = NOW()`);

    params.push(id);

    const result = await this.db.query<{
      id: number;
      fullName: string;
      position: string;
      projectId: number | null;
      baseSalary: number;
      pagIbig: number;
      philhealth: number;
      sss: number;
      contactNumber: string | null;
      address: string | null;
      department: string;
      status: number;
      createdAt: string;
      updatedAt: string | null;
    }>(
      `UPDATE tblpayroll_employees
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING
         id,
         full_name AS "fullName",
         position,
         project_id AS "projectId",
         base_salary::numeric AS "baseSalary",
         pag_ibig::numeric AS "pagIbig",
         philhealth::numeric AS "philhealth",
         sss::numeric AS "sss",
         contact_number AS "contactNumber",
         address,
         department,
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      params,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Employee not found');
    }

    const updated = result.rows[0];
    await this.auditLogService.logMutation({
      action: 'PAYROLL_EMPLOYEE_UPDATE',
      entityType: 'payroll-employee',
      entityId: id,
      actor: auditActor,
      description: `Updated payroll employee #${id}`,
      requestBody: dto as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async createEmployeePayroll(
    employeeId: number,
    dto: CreatePayrollDto,
    userId: number,
    auditActor?: AuditActorContext,
  ) {
    // 1. Validate employee exists and is active
    const empResult = await this.db.query<{
      id: number;
      fullName: string;
      baseSalary: string;
      pagIbig: string;
      philhealth: string;
      sss: string;
      department: string;
    }>(
      `SELECT
         id,
         full_name AS "fullName",
         base_salary::text AS "baseSalary",
         pag_ibig::text AS "pagIbig",
         philhealth::text AS "philhealth",
         sss::text AS "sss",
         department
       FROM tblpayroll_employees
       WHERE id = $1 AND status = 1`,
      [employeeId],
    );

    if (empResult.rows.length === 0) {
      throw new NotFoundException('Employee not found');
    }

    const employee = empResult.rows[0];
    const baseSalary = parseFloat(employee.baseSalary);
    const pagIbig = parseFloat(employee.pagIbig);
    const philhealth = parseFloat(employee.philhealth);
    const sss = parseFloat(employee.sss);

    // 2. Validate cutoffEnd >= cutoffStart
    const cutoffStart = new Date(dto.cutoffStart);
    const cutoffEnd = new Date(dto.cutoffEnd);

    if (cutoffEnd < cutoffStart) {
      throw new BadRequestException('cutoffEnd must be >= cutoffStart');
    }

    // 3. Compute expected day count
    const msPerDay = 24 * 60 * 60 * 1000;
    const expectedDayCount = Math.round((cutoffEnd.getTime() - cutoffStart.getTime()) / msPerDay) + 1;

    // 4. Validate dailyRecords count matches expected day count
    if (dto.dailyRecords.length !== expectedDayCount) {
      throw new BadRequestException('dailyRecords count must match days in cutoff period');
    }

    // 5. Check for overlapping cutoff periods for this employee
    const overlapResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM tblpayroll_records r
       JOIN tblpayroll_cutoffs c ON c.id = r.cutoff_id
       WHERE r.employee_id = $1
         AND c.cutoff_start <= $2
         AND c.cutoff_end >= $3`,
      [employeeId, dto.cutoffEnd, dto.cutoffStart],
    );

    if (parseInt(overlapResult.rows[0].count, 10) > 0) {
      throw new ConflictException('Cutoff period overlaps with existing payroll');
    }

    // 6. Compute totals
    const totalCommissions = dto.dailyRecords
      .filter((r) => r.isPresent)
      .reduce((sum, r) => sum + r.commission, 0);

    const totalAdditionalComp = (dto.additionalCompensation ?? [])
      .reduce((sum, entry) => sum + entry.amount, 0);

    const totalAdditionalDed = (dto.additionalDeductions ?? [])
      .reduce((sum, entry) => sum + entry.amount, 0);

    const totalGovDeductions = pagIbig + philhealth + sss;

    const totalAdjustedRate = dto.dailyRecords
      .filter((r) => r.isPresent)
      .reduce((sum, r) => sum + (r.adjustedRate ?? 0), 0);

    const totalOvertime = dto.dailyRecords
      .filter((r) => r.isPresent)
      .reduce((sum, r) => sum + ((r as any).overtime ?? 0), 0);

    const netPay = totalAdjustedRate + totalOvertime + totalCommissions + totalAdditionalComp - totalAdditionalDed - totalGovDeductions;

    // 7. Execute in a transaction
    try {
      const result = await this.db.withTransaction(async (client) => {
        // 7a. Insert cutoff record
        const cutoffInsert = await client.query<{
          id: number;
          cutoffStart: string;
          cutoffEnd: string;
          createdAt: string;
        }>(
          `INSERT INTO tblpayroll_cutoffs (cutoff_start, cutoff_end, created_by)
           VALUES ($1, $2, $3)
           RETURNING
             id,
             cutoff_start AS "cutoffStart",
             cutoff_end AS "cutoffEnd",
             created_at AS "createdAt"`,
          [dto.cutoffStart, dto.cutoffEnd, userId ?? null],
        );

        const cutoff = cutoffInsert.rows[0];

        // 7b. Insert payroll record with gov deduction snapshot
        const payrollInsert = await client.query<{
          id: number;
          employeeId: number;
          cutoffId: number;
          baseSalaryUsed: string;
          payoutAmount: string;
          pagIbigUsed: string;
          philhealthUsed: string;
          sssUsed: string;
          totalCommissions: string;
          generatedAt: string;
        }>(
          `INSERT INTO tblpayroll_records (employee_id, cutoff_id, base_salary_used, payout_amount, pag_ibig_used, philhealth_used, sss_used, total_commissions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING
             id,
             employee_id AS "employeeId",
             cutoff_id AS "cutoffId",
             base_salary_used::text AS "baseSalaryUsed",
             payout_amount::text AS "payoutAmount",
             pag_ibig_used::text AS "pagIbigUsed",
             philhealth_used::text AS "philhealthUsed",
             sss_used::text AS "sssUsed",
             total_commissions::text AS "totalCommissions",
             generated_at AS "generatedAt"`,
          [employeeId, cutoff.id, baseSalary, netPay, pagIbig, philhealth, sss, totalCommissions],
        );

        const payrollRecord = payrollInsert.rows[0];

        // 7c. Bulk insert daily records
        if (dto.dailyRecords.length > 0) {
          const dailyValues: unknown[] = [];
          const dailyPlaceholders: string[] = [];
          let paramIdx = 1;

          for (const record of dto.dailyRecords) {
            dailyPlaceholders.push(
              `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
            );
            dailyValues.push(
              payrollRecord.id,
              record.date,
              record.isPresent ?? false,
              record.assignedProjectId ?? null,
              record.commission ?? 0,
              record.remarks ?? null,
              record.adjustedRate ?? 0,
              (record as any).overtime ?? 0,
            );
          }

          await client.query(
            `INSERT INTO tblpayroll_daily_records (payroll_record_id, record_date, is_present, assigned_project_id, commission, remarks, adjusted_rate, overtime)
             VALUES ${dailyPlaceholders.join(', ')}`,
            dailyValues,
          );
        }

        // 7d. Bulk insert additional compensation entries
        const compensationEntries = dto.additionalCompensation ?? [];
        if (compensationEntries.length > 0) {
          const compValues: unknown[] = [];
          const compPlaceholders: string[] = [];
          let paramIdx = 1;

          for (const entry of compensationEntries) {
            compPlaceholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
            compValues.push(payrollRecord.id, entry.description, entry.amount);
          }

          await client.query(
            `INSERT INTO tblpayroll_additional_compensation (payroll_record_id, description, amount)
             VALUES ${compPlaceholders.join(', ')}`,
            compValues,
          );
        }

        // 7e. Bulk insert additional deduction entries
        const deductionEntries = dto.additionalDeductions ?? [];
        if (deductionEntries.length > 0) {
          const dedValues: unknown[] = [];
          const dedPlaceholders: string[] = [];
          let paramIdx = 1;

          for (const entry of deductionEntries) {
            dedPlaceholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
            dedValues.push(payrollRecord.id, entry.description, entry.amount);
          }

          await client.query(
            `INSERT INTO tblpayroll_additional_deductions (payroll_record_id, description, amount)
             VALUES ${dedPlaceholders.join(', ')}`,
            dedValues,
          );
        }

        // Return the created payroll record with summary
        return {
          id: payrollRecord.id,
          employeeId: payrollRecord.employeeId,
          employeeName: employee.fullName,
          department: employee.department,
          cutoffId: payrollRecord.cutoffId,
          cutoffStart: cutoff.cutoffStart,
          cutoffEnd: cutoff.cutoffEnd,
          baseSalaryUsed: parseFloat(payrollRecord.baseSalaryUsed),
          payoutAmount: parseFloat(payrollRecord.payoutAmount),
          pagIbigUsed: parseFloat(payrollRecord.pagIbigUsed),
          philhealthUsed: parseFloat(payrollRecord.philhealthUsed),
          sssUsed: parseFloat(payrollRecord.sssUsed),
          totalCommissions: parseFloat(payrollRecord.totalCommissions),
          totalAdditionalCompensation: totalAdditionalComp,
          totalAdditionalDeductions: totalAdditionalDed,
          totalGovernmentDeductions: totalGovDeductions,
          netPay,
          generatedAt: payrollRecord.generatedAt,
        };
      });

      await this.auditLogService.logMutation({
        action: 'PAYROLL_RECORD_CREATE',
        entityType: 'payroll-record',
        entityId: result.id,
        actor: auditActor ?? { userId },
        description: `Created payroll record #${result.id} for employee #${employeeId}`,
        requestBody: dto as unknown as Record<string, unknown>,
        after: result as unknown as Record<string, unknown>,
      });

      return result;
    } catch (error) {
      // Re-throw known HTTP exceptions (they already have proper status codes)
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create payroll record');
    }
  }

  async getPayrollRecordDetails(recordId: number) {
    // 1. Query payroll record with employee name, department, cutoff dates, base salary, payout, generated date, gov deductions
    const recordResult = await this.db.query<{
      id: number;
      employeeName: string;
      department: string;
      cutoffStart: string;
      cutoffEnd: string;
      baseSalaryUsed: number;
      payoutAmount: number;
      generatedAt: string;
      pagIbigUsed: number;
      philhealthUsed: number;
      sssUsed: number;
    }>(
      `SELECT pr.id, pe.full_name AS "employeeName", pe.department,
              pc.cutoff_start AS "cutoffStart", pc.cutoff_end AS "cutoffEnd",
              pr.base_salary_used::numeric AS "baseSalaryUsed",
              pr.payout_amount::numeric AS "payoutAmount",
              pr.generated_at AS "generatedAt",
              pr.pag_ibig_used::numeric AS "pagIbigUsed",
              pr.philhealth_used::numeric AS "philhealthUsed",
              pr.sss_used::numeric AS "sssUsed"
       FROM tblpayroll_records pr
       JOIN tblpayroll_employees pe ON pe.id = pr.employee_id
       JOIN tblpayroll_cutoffs pc ON pc.id = pr.cutoff_id
       WHERE pr.id = $1`,
      [recordId],
    );

    if (recordResult.rows.length === 0) {
      throw new NotFoundException('Payroll record not found');
    }

    const record = recordResult.rows[0];

    // 2. Query daily records with assigned project names (LEFT JOIN projects table)
    const dailyRecordsResult = await this.db.query<{
      date: string;
      isPresent: boolean;
      assignedProjectId: number | null;
      assignedProjectName: string | null;
      adjustedRate: number;
      commission: number;
      remarks: string;
    }>(
      `SELECT dr.record_date AS "date", dr.is_present AS "isPresent",
              dr.assigned_project_id AS "assignedProjectId",
              dr.commission::numeric AS "commission", dr.remarks,
              dr.adjusted_rate::numeric AS "adjustedRate",
              COALESCE(dr.overtime, 0)::numeric AS "overtime"
       FROM tblpayroll_daily_records dr
       WHERE dr.payroll_record_id = $1
       ORDER BY dr.record_date ASC`,
      [recordId],
    );

    // 3. Query additional compensation entries
    const compensationResult = await this.db.query<{
      description: string;
      amount: number;
    }>(
      `SELECT description, amount::numeric FROM tblpayroll_additional_compensation WHERE payroll_record_id = $1`,
      [recordId],
    );

    // 4. Query additional deduction entries
    const deductionsResult = await this.db.query<{
      description: string;
      amount: number;
    }>(
      `SELECT description, amount::numeric FROM tblpayroll_additional_deductions WHERE payroll_record_id = $1`,
      [recordId],
    );

    // Sum adjusted rate for present days only
    const totalAdjustedRate = dailyRecordsResult.rows
      .filter(dr => dr.isPresent)
      .reduce((sum, dr) => sum + Number(dr.adjustedRate ?? 0), 0);

    // Sum commissions
    const totalCommissions = dailyRecordsResult.rows.reduce(
      (sum, dr) => sum + Number(dr.commission ?? 0),
      0
    );

    // Sum additional compensation
    const totalAdditionalCompensation = compensationResult.rows.reduce(
      (sum, c) => sum + Number(c.amount ?? 0),
      0
    );

    // Sum additional deductions
    const totalAdditionalDeductions = deductionsResult.rows.reduce(
      (sum, d) => sum + Number(d.amount ?? 0),
      0
    );

    // Government deductions
    const totalGovernmentDeductions =
      Number(record.pagIbigUsed ?? 0) +
      Number(record.philhealthUsed ?? 0) +
      Number(record.sssUsed ?? 0);

    const computedPayout =
      totalAdjustedRate +
      totalCommissions +
      totalAdditionalCompensation -
      totalAdditionalDeductions -
      totalGovernmentDeductions;


    // 5. Return PayrollRecordDetail object
    return {
      id: record.id,
      employeeName: record.employeeName,
      department: record.department,
      cutoffStart: record.cutoffStart,
      cutoffEnd: record.cutoffEnd,
      baseSalaryUsed: record.baseSalaryUsed,
      payoutAmount: computedPayout,
      generatedAt: record.generatedAt,
      dailyRecords: dailyRecordsResult.rows,
      additionalCompensation: compensationResult.rows,
      additionalDeductions: deductionsResult.rows,
      governmentDeductions: {
        pagIbig: record.pagIbigUsed,
        philhealth: record.philhealthUsed,
        sss: record.sssUsed,
      },
    };
  }

  async updatePayrollRecord(
    recordId: number,
    dto: CreatePayrollDto,
    auditActor?: AuditActorContext,
  ) {
    // 1. Verify record exists and get employee info
    const recordResult = await this.db.query<{
      id: number;
      employeeId: number;
      cutoffId: number;
      baseSalary: string;
      pagIbig: string;
      philhealth: string;
      sss: string;
    }>(
      `SELECT
         r.id,
         r.employee_id AS "employeeId",
         r.cutoff_id AS "cutoffId",
         r.base_salary_used::text AS "baseSalary",
         r.pag_ibig_used::text AS "pagIbig",
         r.philhealth_used::text AS "philhealth",
         r.sss_used::text AS "sss"
       FROM tblpayroll_records r
       WHERE r.id = $1`,
      [recordId],
    );

    if (recordResult.rows.length === 0) {
      throw new NotFoundException('Payroll record not found');
    }

    const record = recordResult.rows[0];
    const pagIbig = parseFloat(record.pagIbig);
    const philhealth = parseFloat(record.philhealth);
    const sss = parseFloat(record.sss);

    // 2. Compute new totals
    const totalCommissions = dto.dailyRecords
      .filter((r) => r.isPresent)
      .reduce((sum, r) => sum + (r.commission ?? 0), 0);

    const totalAdditionalComp = (dto.additionalCompensation ?? [])
      .reduce((sum, entry) => sum + entry.amount, 0);

    const totalAdditionalDed = (dto.additionalDeductions ?? [])
      .reduce((sum, entry) => sum + entry.amount, 0);

    const totalGovDeductions = pagIbig + philhealth + sss;

    const totalAdjustedRate = dto.dailyRecords
      .filter((r) => r.isPresent)
      .reduce((sum, r) => sum + (r.adjustedRate ?? 0), 0);

    const totalOvertime = dto.dailyRecords
      .filter((r) => r.isPresent)
      .reduce((sum, r) => sum + ((r as any).overtime ?? 0), 0);

    const netPay = totalAdjustedRate + totalOvertime + totalCommissions + totalAdditionalComp - totalAdditionalDed - totalGovDeductions;

    // 3. Execute update in a transaction
    try {
      await this.db.withTransaction(async (client) => {
        // 3a. Update payout amount and total commissions
        await client.query(
          `UPDATE tblpayroll_records
           SET payout_amount = $1, total_commissions = $2
           WHERE id = $3`,
          [netPay, totalCommissions, recordId],
        );

        // 3b. Delete existing daily records and re-insert
        await client.query(
          `DELETE FROM tblpayroll_daily_records WHERE payroll_record_id = $1`,
          [recordId],
        );

        if (dto.dailyRecords.length > 0) {
          const dailyValues: unknown[] = [];
          const dailyPlaceholders: string[] = [];
          let paramIdx = 1;

          for (const dailyRecord of dto.dailyRecords) {
            dailyPlaceholders.push(
              `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
            );
            dailyValues.push(
              recordId,
              dailyRecord.date,
              dailyRecord.isPresent ?? false,
              dailyRecord.assignedProjectId ?? null,
              dailyRecord.commission ?? 0,
              dailyRecord.remarks ?? null,
              dailyRecord.adjustedRate ?? 0,
              (dailyRecord as any).overtime ?? 0,
            );
          }

          await client.query(
            `INSERT INTO tblpayroll_daily_records (payroll_record_id, record_date, is_present, assigned_project_id, commission, remarks, adjusted_rate, overtime)
             VALUES ${dailyPlaceholders.join(', ')}`,
            dailyValues,
          );
        }

        // 3c. Delete existing compensation and re-insert
        await client.query(
          `DELETE FROM tblpayroll_additional_compensation WHERE payroll_record_id = $1`,
          [recordId],
        );

        const compensationEntries = dto.additionalCompensation ?? [];
        if (compensationEntries.length > 0) {
          const compValues: unknown[] = [];
          const compPlaceholders: string[] = [];
          let paramIdx = 1;

          for (const entry of compensationEntries) {
            compPlaceholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
            compValues.push(recordId, entry.description, entry.amount);
          }

          await client.query(
            `INSERT INTO tblpayroll_additional_compensation (payroll_record_id, description, amount)
             VALUES ${compPlaceholders.join(', ')}`,
            compValues,
          );
        }

        // 3d. Delete existing deductions and re-insert
        await client.query(
          `DELETE FROM tblpayroll_additional_deductions WHERE payroll_record_id = $1`,
          [recordId],
        );

        const deductionEntries = dto.additionalDeductions ?? [];
        if (deductionEntries.length > 0) {
          const dedValues: unknown[] = [];
          const dedPlaceholders: string[] = [];
          let paramIdx = 1;

          for (const entry of deductionEntries) {
            dedPlaceholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
            dedValues.push(recordId, entry.description, entry.amount);
          }

          await client.query(
            `INSERT INTO tblpayroll_additional_deductions (payroll_record_id, description, amount)
             VALUES ${dedPlaceholders.join(', ')}`,
            dedValues,
          );
        }
      });

      await this.auditLogService.logMutation({
        action: 'PAYROLL_RECORD_UPDATE',
        entityType: 'payroll-record',
        entityId: recordId,
        actor: auditActor,
        description: `Updated payroll record #${recordId}`,
        requestBody: dto as unknown as Record<string, unknown>,
        after: { id: recordId, payoutAmount: netPay },
      });

      return { id: recordId, payoutAmount: netPay };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update payroll record');
    }
  }
}
