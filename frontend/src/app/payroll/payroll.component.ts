import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DatePickerComponent } from '../shared/components/form/date-picker/date-picker.component';
import { PageBreadcrumbComponent } from '../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { RbacService } from '../shared/services/rbac.service';
import { apiClient } from '../shared/services/api-client';
import axios from 'axios';

const currentDate = new Date().toISOString().split('T')[0];

export interface PayrollEmployee {
  id: number;
  fullName: string;
  position: string;
  projectId: number | null;
  projectName: string | null;
  baseSalary: number;
  pagIbig: number;
  philhealth: number;
  sss: number;
  contactNumber: string | null;
  address: string | null;
  department: string;
  status: number;
  createdAt: string;
}

export interface DailyRecord {
  date: string;
  isPresent: boolean;
  assignedProjectId: number | null;
  commission: number;
  adjustedRate: number;
  remarks: string;
}

export interface CompensationEntry {
  description: string;
  amount: number | null;
}

export interface DeductionEntry {
  description: string;
  amount: number | null;
}

export interface PayrollSummary {
  baseSalary: number;
  totalBaseSalary: number;
  totalDaysPresent: number;
  totalDaysInPeriod: number;
  totalCommissions: number;
  totalAdditionalCompensation: number;
  totalAdditionalDeductions: number;
  totalGovernmentDeductions: number;
  netPay: number;
}

export interface PayrollRecordDetail {
  id: number;
  employeeName: string;
  department: string;
  cutoffStart: string;
  cutoffEnd: string;
  baseSalaryUsed: number;
  payoutAmount: number;
  generatedAt: string;
  dailyRecords: Array<{
    date: string;
    isPresent: boolean;
    assignedProjectId: number | null;
    assignedProjectName: string | null;
    commission: number;
    adjustedRate: number;
    remarks: string;
  }>;
  additionalCompensation: Array<{ description: string; amount: number }>;
  additionalDeductions: Array<{ description: string; amount: number }>;
  governmentDeductions: {
    pagIbig: number;
    philhealth: number;
    sss: number;
  };
}

export interface PayrollProject {
  id: number;
  name: string;
}

export interface PayrollEmployeeSummary {
  generatedPayrollCount: number;
  currentPayout: number;
  totalPayout: number;
}

export interface PayrollEmployeeCutoff {
  id: number;
  recordId: number;
  cutoffStart: string;
  cutoffEnd: string;
  payoutAmount: number;
  generatedAt: string;
}

export interface AddEmployeeErrors {
  fullName?: string;
  position?: string;
  baseSalary?: string;
  department?: string;
  pagIbig?: string;
  philhealth?: string;
  sss?: string;
}

export interface CreatePayrollErrors {
  cutoffStart?: string;
  cutoffEnd?: string;
  employeeIds?: string;
}

export interface PayrollCutoffDetail {
  id: number;
  cutoffStart: string;
  cutoffEnd: string;
  createdAt: string;
  records: Array<{
    employeeId: number;
    employeeName: string;
    baseSalaryUsed: number;
    payoutAmount: number;
    generatedAt: string;
  }>;
}

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, PageBreadcrumbComponent, DatePickerComponent],
  templateUrl: './payroll.component.html',
})
export class PayrollComponent implements OnInit {

  employees: PayrollEmployee[] = [];
  selectedEmployee: PayrollEmployee | null = null;

  positionFilter = '';
  projectFilter = '';
  searchTerm = '';

  positions: string[] = [];
  projects: PayrollProject[] = [];

  isLoading = false;
  errorMessage = '';

  employeeSummary: PayrollEmployeeSummary | null = null;
  employeeCutoffs: PayrollEmployeeCutoff[] = [];
  isSummaryLoading = false;

  // Add Employee form state
  showAddEmployeeForm = false;
  addEmployeeFullName = '';
  addEmployeePosition = '';
  addEmployeeProjectId: number | null = null;
  addEmployeeBaseSalary: number | null = null;
  addEmployeeDepartment = '';
  addEmployeePagIbig = 0;
  addEmployeePhilhealth = 0;
  addEmployeeSss = 0;
  addEmployeeContactNumber = '';
  addEmployeeAddress = '';
  addEmployeeErrors: AddEmployeeErrors = {};
  addEmployeeApiError = '';
  isAddEmployeeSubmitting = false;

  // Create Payroll form state
  showCreatePayrollForm = false;
  createPayrollCutoffStart = currentDate;
  createPayrollCutoffEnd = currentDate;
  createPayrollSelectedEmployeeIds: number[] = [];
  createPayrollErrors: CreatePayrollErrors = {};
  createPayrollApiError = '';
  isCreatePayrollSubmitting = false;

  // Payroll Creator state (per-employee)
  showPayrollCreator = false;
  payrollCreatorCutoffStart = currentDate;
  payrollCreatorCutoffEnd = currentDate;
  payrollCreatorDailyRecords: DailyRecord[] = [];
  payrollCreatorCompensation: CompensationEntry[] = [];
  payrollCreatorDeductions: DeductionEntry[] = [];
  payrollCreatorErrors: { dateRange?: string; general?: string } = {};
  payrollCreatorSelectedTab = 0;
  isPayrollCreatorSubmitting = false;

  // View Cutoff Detail state
  showCutoffDetail = false;
  cutoffDetail: PayrollCutoffDetail | null = null;
  isCutoffDetailLoading = false;

  // Enhanced Payroll Record Detail state
  payrollRecordDetail: PayrollRecordDetail | null = null;
  isPayrollRecordDetailLoading = false;

  constructor(private readonly rbacService: RbacService) {}

  ngOnInit(): void {
    void this.loadEmployees();
    void this.loadProjects();
  }

  get filteredEmployees(): PayrollEmployee[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.employees.filter((emp) => {
      const matchesPosition = !this.positionFilter || emp.position === this.positionFilter;
      const matchesProject =
        !this.projectFilter || String(emp.projectId) === this.projectFilter;
      const matchesSearch = !term || emp.fullName.toLowerCase().includes(term);
      return matchesPosition && matchesProject && matchesSearch;
    });
  }

  async loadEmployees(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const params: Record<string, string> = {};
      if (this.positionFilter) {
        params['position'] = this.positionFilter;
      }
      if (this.projectFilter) {
        params['project_id'] = this.projectFilter;
      }

      const response = await apiClient.get<{ success: boolean; data: PayrollEmployee[] }>(
        '/payroll/employees',
        { params },
      );

      if (response.data?.success) {
        this.employees = response.data.data;
        this.positions = this.extractDistinctPositions(this.employees);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.errorMessage =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to load employees';
      } else {
        this.errorMessage = 'Unable to load employees';
      }
    } finally {
      this.isLoading = false;
    }
  }

  async loadProjects(): Promise<void> {
    try {
      const response = await apiClient.get<{ success: boolean; data: PayrollProject[] }>(
        '/projects',
      );

      if (response.data?.success) {
        this.projects = response.data.data ?? [];
      }
    } catch {
      // Projects loading is non-critical; silently fail
      this.projects = [];
    }
  }

  onPositionFilterChange(): void {
    void this.loadEmployees();
  }

  onProjectFilterChange(): void {
    void this.loadEmployees();
  }

  selectEmployee(employee: PayrollEmployee): void {
    this.selectedEmployee = employee;
    void this.loadEmployeeSummary(employee.id);
    void this.loadEmployeeCutoffs(employee.id);
  }

  async loadEmployeeSummary(employeeId: number): Promise<void> {
    this.isSummaryLoading = true;
    this.employeeSummary = null;

    try {
      const response = await apiClient.get<{ success: boolean; data: PayrollEmployeeSummary }>(
        `/payroll/employees/${employeeId}/summary`,
      );

      if (response.data?.success) {
        this.employeeSummary = response.data.data;
      }
    } catch {
      this.employeeSummary = null;
    } finally {
      this.isSummaryLoading = false;
    }
  }

  async loadEmployeeCutoffs(employeeId: number): Promise<void> {
    try {
      const response = await apiClient.get<{ success: boolean; data: PayrollEmployeeCutoff[] }>(
        `/payroll/employees/${employeeId}/cutoffs`,
      );

      if (response.data?.success) {
        this.employeeCutoffs = response.data.data ?? [];
      }
    } catch {
      this.employeeCutoffs = [];
    }
  }

  // Edit Employee Form State
  showEditEmployeeForm = false;
  editFullName = '';
  editPosition = '';
  editProjectId: string = '';
  editBaseSalary: number | null = null;
  editEmployeeDepartment = '';
  editEmployeePagIbig = 0;
  editEmployeePhilhealth = 0;
  editEmployeeSss = 0;
  editEmployeeContactNumber = '';
  editEmployeeAddress = '';
  editErrors: { fullName?: string; position?: string; baseSalary?: string; department?: string; pagIbig?: string; philhealth?: string; sss?: string; general?: string } = {};
  isEditSubmitting = false;

  openEditEmployeeForm(): void {
    if (!this.selectedEmployee) return;
    this.editFullName = this.selectedEmployee.fullName;
    this.editPosition = this.selectedEmployee.position;
    this.editProjectId = this.selectedEmployee.projectId ? String(this.selectedEmployee.projectId) : '';
    this.editBaseSalary = this.selectedEmployee.baseSalary;
    this.editEmployeeDepartment = this.selectedEmployee.department;
    this.editEmployeePagIbig = this.selectedEmployee.pagIbig;
    this.editEmployeePhilhealth = this.selectedEmployee.philhealth;
    this.editEmployeeSss = this.selectedEmployee.sss;
    this.editEmployeeContactNumber = this.selectedEmployee.contactNumber || '';
    this.editEmployeeAddress = this.selectedEmployee.address || '';
    this.editErrors = {};
    this.showEditEmployeeForm = true;
  }

  closeEditEmployeeForm(): void {
    this.showEditEmployeeForm = false;
    this.editErrors = {};
  }

  validateEditForm(): boolean {
    this.editErrors = {};
    let valid = true;

    if (!this.editFullName || !this.editFullName.trim()) {
      this.editErrors.fullName = 'Full name is required.';
      valid = false;
    }

    if (!this.editPosition || !this.editPosition.trim()) {
      this.editErrors.position = 'Position is required.';
      valid = false;
    }

    if (this.editBaseSalary === null || this.editBaseSalary === undefined || this.editBaseSalary <= 0) {
      this.editErrors.baseSalary = 'Base salary must be a positive number.';
      valid = false;
    }

    if (!this.editEmployeeDepartment) {
      this.editErrors.department = 'Department is required.';
      valid = false;
    }

    if (this.editEmployeePagIbig < 0) {
      this.editErrors.pagIbig = 'Pag-Ibig must be zero or greater.';
      valid = false;
    }

    if (this.editEmployeePhilhealth < 0) {
      this.editErrors.philhealth = 'Philhealth must be zero or greater.';
      valid = false;
    }

    if (this.editEmployeeSss < 0) {
      this.editErrors.sss = 'SSS must be zero or greater.';
      valid = false;
    }

    return valid;
  }

  async submitEditEmployee(): Promise<void> {
    if (!this.validateEditForm() || !this.selectedEmployee) return;

    this.isEditSubmitting = true;
    this.editErrors = {};

    try {
      const body: Record<string, unknown> = {
        fullName: this.editFullName.trim(),
        position: this.editPosition.trim(),
        baseSalary: this.editBaseSalary,
        department: this.editEmployeeDepartment,
        pagIbig: this.editEmployeePagIbig,
        philhealth: this.editEmployeePhilhealth,
        sss: this.editEmployeeSss,
      };

      if (this.editProjectId) {
        body['projectId'] = Number(this.editProjectId);
      } else {
        body['projectId'] = null;
      }

      if (this.editEmployeeContactNumber.trim()) {
        body['contactNumber'] = this.editEmployeeContactNumber.trim();
      } else {
        body['contactNumber'] = null;
      }

      if (this.editEmployeeAddress.trim()) {
        body['address'] = this.editEmployeeAddress.trim();
      } else {
        body['address'] = null;
      }

      const response = await apiClient.patch<{ success: boolean; data: PayrollEmployee }>(
        `/payroll/employees/${this.selectedEmployee.id}`,
        body,
      );

      if (response.data?.success) {
        // Refresh employee list and re-select the updated employee
        await this.loadEmployees();
        const updated = this.employees.find((e) => e.id === this.selectedEmployee!.id);
        if (updated) {
          this.selectedEmployee = updated;
          void this.loadEmployeeSummary(updated.id);
          void this.loadEmployeeCutoffs(updated.id);
        }
        this.showEditEmployeeForm = false;
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.editErrors.general =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Failed to update employee.';
      } else {
        this.editErrors.general = 'Failed to update employee.';
      }
    } finally {
      this.isEditSubmitting = false;
    }
  }

  canEditEmployee(): boolean {
    return this.rbacService.hasEffectivePermissionKey('payroll.employee.edit');
  }

  canCreateEmployee(): boolean {
    return this.rbacService.hasEffectivePermissionKey('payroll.employee.create');
  }

  openAddEmployeeForm(): void {
    this.showAddEmployeeForm = true;
    this.addEmployeeFullName = '';
    this.addEmployeePosition = '';
    this.addEmployeeProjectId = null;
    this.addEmployeeBaseSalary = null;
    this.addEmployeeDepartment = '';
    this.addEmployeePagIbig = 0;
    this.addEmployeePhilhealth = 0;
    this.addEmployeeSss = 0;
    this.addEmployeeContactNumber = '';
    this.addEmployeeAddress = '';
    this.addEmployeeErrors = {};
    this.addEmployeeApiError = '';
  }

  closeAddEmployeeForm(): void {
    this.showAddEmployeeForm = false;
    this.addEmployeeErrors = {};
    this.addEmployeeApiError = '';
  }

  validateAddEmployeeForm(): boolean {
    this.addEmployeeErrors = {};
    let isValid = true;

    if (!this.addEmployeeFullName || !this.addEmployeeFullName.trim()) {
      this.addEmployeeErrors.fullName = 'Full name is required.';
      isValid = false;
    }

    if (!this.addEmployeePosition || !this.addEmployeePosition.trim()) {
      this.addEmployeeErrors.position = 'Position is required.';
      isValid = false;
    }

    if (this.addEmployeeBaseSalary === null || this.addEmployeeBaseSalary === undefined || this.addEmployeeBaseSalary <= 0) {
      this.addEmployeeErrors.baseSalary = 'Base salary must be greater than 0.';
      isValid = false;
    }

    if (!this.addEmployeeDepartment) {
      this.addEmployeeErrors.department = 'Department is required.';
      isValid = false;
    }

    if (this.addEmployeePagIbig < 0) {
      this.addEmployeeErrors.pagIbig = 'Pag-Ibig must be zero or greater.';
      isValid = false;
    }

    if (this.addEmployeePhilhealth < 0) {
      this.addEmployeeErrors.philhealth = 'Philhealth must be zero or greater.';
      isValid = false;
    }

    if (this.addEmployeeSss < 0) {
      this.addEmployeeErrors.sss = 'SSS must be zero or greater.';
      isValid = false;
    }

    return isValid;
  }

  async submitAddEmployee(): Promise<void> {
    if (!this.validateAddEmployeeForm()) {
      return;
    }

    this.isAddEmployeeSubmitting = true;
    this.addEmployeeApiError = '';

    try {
      const body: Record<string, unknown> = {
        fullName: this.addEmployeeFullName.trim(),
        position: this.addEmployeePosition.trim(),
        baseSalary: this.addEmployeeBaseSalary,
        department: this.addEmployeeDepartment,
        pagIbig: this.addEmployeePagIbig,
        philhealth: this.addEmployeePhilhealth,
        sss: this.addEmployeeSss,
      };

      if (this.addEmployeeProjectId) {
        body['projectId'] = this.addEmployeeProjectId;
      }

      if (this.addEmployeeContactNumber.trim()) {
        body['contactNumber'] = this.addEmployeeContactNumber.trim();
      }

      if (this.addEmployeeAddress.trim()) {
        body['address'] = this.addEmployeeAddress.trim();
      }

      await apiClient.post('/payroll/employees', body);
      await this.loadEmployees();
      this.closeAddEmployeeForm();
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        this.addEmployeeApiError =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Failed to add employee. Please try again.';
      } else {
        this.addEmployeeApiError = 'Failed to add employee. Please try again.';
      }
    } finally {
      this.isAddEmployeeSubmitting = false;
    }
  }

  isSelectedEmployee(employee: PayrollEmployee): boolean {
    return this.selectedEmployee?.id === employee.id;
  }

  private extractDistinctPositions(employees: PayrollEmployee[]): string[] {
    const positionSet = new Set(
      employees
        .map((emp) => emp.position)
        .filter((pos) => pos && pos.trim().length > 0),
    );
    return [...positionSet].sort((a, b) => a.localeCompare(b));
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  formatDateRange(start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
  }

  // Create Payroll methods
  canCreatePayroll(): boolean {
    return this.rbacService.hasEffectivePermissionKey('payroll.create');
  }

  openCreatePayrollForm(): void {
    this.showCreatePayrollForm = true;
    this.createPayrollCutoffStart = '';
    this.createPayrollCutoffEnd = '';
    this.createPayrollSelectedEmployeeIds = [];
    this.createPayrollErrors = {};
    this.createPayrollApiError = '';
  }

  closeCreatePayrollForm(): void {
    this.showCreatePayrollForm = false;
    this.createPayrollCutoffStart = '';
    this.createPayrollCutoffEnd = '';
    this.createPayrollSelectedEmployeeIds = [];
    this.createPayrollErrors = {};
    this.createPayrollApiError = '';
  }

  togglePayrollEmployee(employeeId: number): void {
    const index = this.createPayrollSelectedEmployeeIds.indexOf(employeeId);
    if (index === -1) {
      this.createPayrollSelectedEmployeeIds = [...this.createPayrollSelectedEmployeeIds, employeeId];
    } else {
      this.createPayrollSelectedEmployeeIds = this.createPayrollSelectedEmployeeIds.filter(
        (id) => id !== employeeId,
      );
    }
  }

  isPayrollEmployeeSelected(employeeId: number): boolean {
    return this.createPayrollSelectedEmployeeIds.includes(employeeId);
  }

  validateCreatePayrollForm(): boolean {
    this.createPayrollErrors = {};
    let isValid = true;

    if (!this.createPayrollCutoffStart) {
      this.createPayrollErrors.cutoffStart = 'Cutoff start date is required';
      isValid = false;
    }

    if (!this.createPayrollCutoffEnd) {
      this.createPayrollErrors.cutoffEnd = 'Cutoff end date is required';
      isValid = false;
    }

    if (
      this.createPayrollCutoffStart &&
      this.createPayrollCutoffEnd &&
      this.createPayrollCutoffEnd < this.createPayrollCutoffStart
    ) {
      this.createPayrollErrors.cutoffEnd = 'End date must be on or after start date';
      isValid = false;
    }

    if (this.createPayrollSelectedEmployeeIds.length === 0) {
      this.createPayrollErrors.employeeIds = 'At least one employee must be selected';
      isValid = false;
    }

    return isValid;
  }

  async submitCreatePayroll(): Promise<void> {
    if (!this.validateCreatePayrollForm()) {
      return;
    }

    this.isCreatePayrollSubmitting = true;
    this.createPayrollApiError = '';

    try {
      const response = await apiClient.post<{ success: boolean }>('/payroll/cutoffs', {
        cutoffStart: this.createPayrollCutoffStart,
        cutoffEnd: this.createPayrollCutoffEnd,
        employeeIds: this.createPayrollSelectedEmployeeIds,
      });

      if (response.data?.success) {
        // Refresh selected employee's summary and cutoff list if they were included
        const includedIds = [...this.createPayrollSelectedEmployeeIds];
        this.closeCreatePayrollForm();

        if (this.selectedEmployee && includedIds.includes(this.selectedEmployee.id)) {
          void this.loadEmployeeSummary(this.selectedEmployee.id);
          void this.loadEmployeeCutoffs(this.selectedEmployee.id);
        }
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        this.createPayrollApiError =
          'Cutoff period overlaps with existing payroll for selected employees';
      } else if (axios.isAxiosError(error)) {
        this.createPayrollApiError =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to create payroll';
      } else {
        this.createPayrollApiError = 'Unable to create payroll';
      }
    } finally {
      this.isCreatePayrollSubmitting = false;
    }
  }

  async viewCutoffDetail(cutoffId: number, recordId?: number): Promise<void> {
    this.showCutoffDetail = true;
    this.isCutoffDetailLoading = true;
    this.cutoffDetail = null;
    this.payrollRecordDetail = null;

    try {
      const response = await apiClient.get<{ success: boolean; data: PayrollCutoffDetail }>(
        `/payroll/cutoffs/${cutoffId}`,
      );

      if (response.data?.success) {
        this.cutoffDetail = response.data.data;
      }
    } catch {
      this.cutoffDetail = null;
    } finally {
      this.isCutoffDetailLoading = false;
    }

    // Load enhanced payroll record detail if recordId is provided
    if (recordId) {
      void this.loadPayrollRecordDetail(recordId);
    }
  }

  closeCutoffDetail(): void {
    this.showCutoffDetail = false;
    this.cutoffDetail = null;
    this.payrollRecordDetail = null;
  }

  async loadPayrollRecordDetail(recordId: number): Promise<void> {
    this.isPayrollRecordDetailLoading = true;
    this.payrollRecordDetail = null;
    try {
      const response = await apiClient.get<{ success: boolean; data: PayrollRecordDetail }>(
        `/payroll/records/${recordId}/details`,
      );
      if (response.data?.success) {
        this.payrollRecordDetail = response.data.data;
      }
    } catch {
      this.payrollRecordDetail = null;
    } finally {
      this.isPayrollRecordDetailLoading = false;
    }
  }

  getSubTotalAdjustedRate(): number {
    if (!this.payrollRecordDetail) return 0;
    const presentDays = this.payrollRecordDetail.dailyRecords.filter(r => r.isPresent);
    return presentDays.reduce((sum, r) => sum + Number(r.adjustedRate ?? 0), 0);
  }
  getSubTotalCommissions(): number {
    if (!this.payrollRecordDetail) return 0;
    const presentAtt = this.payrollRecordDetail.dailyRecords.filter(r => r.isPresent);
    return presentAtt.reduce((sum, e) => Number(sum) + Number(e.commission), 0);
  }

  getAdditionalCompensationTotal(): number {
    if (!this.payrollRecordDetail) return 0;
    return this.payrollRecordDetail.additionalCompensation.reduce((sum, e) => Number(sum) + Number(e.amount), 0);
  }

  getAdditionalDeductionsTotal(): number {
    if (!this.payrollRecordDetail) return 0;
    return this.payrollRecordDetail.additionalDeductions.reduce((sum, e) => Number(sum) + Number(e.amount), 0);
  }

  getGovernmentDeductionsTotal(): number {
    if (!this.payrollRecordDetail) return 0;
    const pagIbig = Number(this.selectedEmployee?.pagIbig ?? 0);
    const philhealth = Number(this.selectedEmployee?.philhealth ?? 0);
    const sss = Number(this.selectedEmployee?.sss ?? 0);

    const totalGovernmentDeductions = pagIbig + philhealth + sss;

    return totalGovernmentDeductions;
  }

  // Payroll Creator methods
  openPayrollCreator(): void {
    this.showPayrollCreator = true;
    this.payrollCreatorCutoffStart = '';
    this.payrollCreatorCutoffEnd = '';
    this.payrollCreatorDailyRecords = [];
    this.payrollCreatorCompensation = [];
    this.payrollCreatorDeductions = [];
    this.payrollCreatorErrors = {};
    this.payrollCreatorSelectedTab = 0;
    this.isPayrollCreatorSubmitting = false;
  }

  closePayrollCreator(): void {
    this.showPayrollCreator = false;
    this.payrollCreatorCutoffStart = '';
    this.payrollCreatorCutoffEnd = '';
    this.payrollCreatorDailyRecords = [];
    this.payrollCreatorCompensation = [];
    this.payrollCreatorDeductions = [];
    this.payrollCreatorErrors = {};
    this.payrollCreatorSelectedTab = 0;
    this.isPayrollCreatorSubmitting = false;
  }

  generatePayrollCreatorDays(): void {
    this.payrollCreatorErrors = {};

    if (!this.payrollCreatorCutoffStart || !this.payrollCreatorCutoffEnd) {
      this.payrollCreatorErrors.dateRange = 'Both start and end dates are required.';
      return;
    }

    if (this.payrollCreatorCutoffEnd < this.payrollCreatorCutoffStart) {
      this.payrollCreatorErrors.dateRange = 'End date must be on or after start date';
      return;
    }

    const records: DailyRecord[] = [];
    const start = new Date(this.payrollCreatorCutoffStart);
    const end = new Date(this.payrollCreatorCutoffEnd);
    const current = new Date(start);
    while (current <= end) {
      records.push({
        date: current.toISOString().split('T')[0],
        isPresent: true,
        assignedProjectId: null,
        commission: 0,
        adjustedRate: this.selectedEmployee!.baseSalary,
        remarks: ''
      });
      current.setDate(current.getDate() + 1);
    }
    this.payrollCreatorDailyRecords = records;
    this.payrollCreatorSelectedTab = 0;
  }

  // Additional Compensation methods
  addCompensationEntry(): void {
    this.payrollCreatorCompensation.push({ description: '', amount: null });
  }

  removeCompensationEntry(index: number): void {
    this.payrollCreatorCompensation.splice(index, 1);
  }

  // Additional Deductions methods
  addDeductionEntry(): void {
    this.payrollCreatorDeductions.push({ description: '', amount: null });
  }

  removeDeductionEntry(index: number): void {
    this.payrollCreatorDeductions.splice(index, 1);
  }

  onDailyRecordPresentChange(index: number): void {
    if (!this.payrollCreatorDailyRecords[index].isPresent) {
      this.payrollCreatorDailyRecords[index].commission = 0;
    }
  }

  formatTabDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async submitPayrollCreator(): Promise<void> {
    if (!this.selectedEmployee || this.payrollCreatorDailyRecords.length === 0) return;

    // Validate compensation entries
    for (const entry of this.payrollCreatorCompensation) {
      if (!entry.amount || entry.amount <= 0) {
        this.payrollCreatorErrors.general = 'All compensation amounts must be greater than 0';
        return;
      }
      if (!entry.description.trim()) {
        this.payrollCreatorErrors.general = 'All compensation entries require a description';
        return;
      }
    }

    // Validate deduction entries
    for (const entry of this.payrollCreatorDeductions) {
      if (!entry.amount || entry.amount <= 0) {
        this.payrollCreatorErrors.general = 'All deduction amounts must be greater than 0';
        return;
      }
      if (!entry.description.trim()) {
        this.payrollCreatorErrors.general = 'All deduction entries require a description';
        return;
      }
    }

    this.isPayrollCreatorSubmitting = true;
    this.payrollCreatorErrors = {};

    try {
      const body = {
        cutoffStart: this.payrollCreatorCutoffStart,
        cutoffEnd: this.payrollCreatorCutoffEnd,
        dailyRecords: this.payrollCreatorDailyRecords.map(r => ({
          date: r.date,
          isPresent: r.isPresent,
          assignedProjectId: r.assignedProjectId || null,
          commission: r.commission || 0,
          adjustedRate: r.adjustedRate ?? 0,
          remarks: r.remarks || undefined
        })),
        additionalCompensation: this.payrollCreatorCompensation
          .filter(e => e.amount && e.amount > 0)
          .map(e => ({ description: e.description.trim(), amount: e.amount })),
        additionalDeductions: this.payrollCreatorDeductions
          .filter(e => e.amount && e.amount > 0)
          .map(e => ({ description: e.description.trim(), amount: e.amount }))
      };

      const response = await apiClient.post(
        `/payroll/employees/${this.selectedEmployee.id}/payroll`,
        body
      );

      if (response.data?.success) {
        this.closePayrollCreator();
        void this.loadEmployeeSummary(this.selectedEmployee!.id);
        void this.loadEmployeeCutoffs(this.selectedEmployee!.id);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          this.payrollCreatorErrors.general = 'Cutoff period overlaps with existing payroll for this employee';
        } else if (error.response?.status === 400) {
          this.payrollCreatorErrors.general = (error.response.data as any)?.message ?? 'Validation error';
        } else {
          this.payrollCreatorErrors.general = 'Unable to complete request. Please try again.';
        }
      } else {
        this.payrollCreatorErrors.general = 'Unable to complete request. Please try again.';
      }
    } finally {
      this.isPayrollCreatorSubmitting = false;
    }
  }

  get payrollSummary(): PayrollSummary {
    const baseSalary = this.selectedEmployee?.baseSalary ?? 0;
    const totalBaseSalary = baseSalary * this.payrollCreatorDailyRecords.length;
    const totalDaysPresent = this.payrollCreatorDailyRecords.filter(r => r.isPresent).length;
    const totalDaysInPeriod = this.payrollCreatorDailyRecords.length;
    const totalCommissions = this.payrollCreatorDailyRecords
      .filter(r => r.isPresent)
      .reduce((sum, r) => Number(sum) + (Number(r.commission) || 0), 0);
    const totalAdditionalCompensation = this.payrollCreatorCompensation
      .reduce((sum, e) => Number(sum) + (Number(e.amount) || 0), 0);
    const totalAdditionalDeductions = this.payrollCreatorDeductions
      .reduce((sum, e) => Number(sum) + (Number(e.amount) || 0), 0);

    const pagIbig = Number(this.selectedEmployee?.pagIbig ?? 0);
    const philhealth = Number(this.selectedEmployee?.philhealth ?? 0);
    const sss = Number(this.selectedEmployee?.sss ?? 0);

    const totalGovernmentDeductions = pagIbig + philhealth + sss;


    const netPay = totalBaseSalary + totalCommissions + totalAdditionalCompensation -
      totalAdditionalDeductions - totalGovernmentDeductions;

    return {
      baseSalary,
      totalBaseSalary,
      totalDaysPresent,
      totalDaysInPeriod,
      totalCommissions,
      totalAdditionalCompensation,
      totalAdditionalDeductions,
      totalGovernmentDeductions,
      netPay
    };
  }

  async generatePayslipPdf(): Promise<void> {
    if (!this.payrollRecordDetail) return;

    const detail = this.payrollRecordDetail;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const addPage = () => {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    };

    const checkPageBreak = (needed: number) => {
      if (y - needed < margin) {
        addPage();
      }
    };

    const drawText = (text: string, x: number, yPos: number, options: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
      page.drawText(text, {
        x,
        y: yPos,
        size: options.size ?? 10,
        font: options.font ?? font,
        color: options.color ?? rgb(0, 0, 0),
      });
    };

    const drawLine = (x1: number, yPos: number, x2: number) => {
      page.drawLine({
        start: { x: x1, y: yPos },
        end: { x: x2, y: yPos },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
    };

    const fmtCurrency = (amount: number): string => {
      return amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // === HEADER ===
    drawText('PAYSLIP', margin, y, { font: fontBold, size: 18 });
    y -= 28;

    drawText(`Employee: ${detail.employeeName}`, margin, y, { size: 10 });
    y -= 16;
    drawText(`Department: ${detail.department}`, margin, y, { size: 10 });
    y -= 16;
    const sdate = new Date(detail.cutoffStart);
    const edate = new Date(detail.cutoffEnd);
    const startFormatted = sdate.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const endFormatted = edate.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    drawText(`Cutoff Period: ${startFormatted} to ${endFormatted}`, margin, y, { size: 10 });
    y -= 16;
    const generationDate = new Date(detail.generatedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    drawText(`Generation Date: ${generationDate}`, margin, y, { size: 10 });
    y -= 24;
    drawLine(margin, y, pageWidth - margin);
    y -= 20;

    // === COMPENSATION SUMMARY ===
    checkPageBreak(80);
    drawText('Compensation Summary', margin, y, { font: fontBold, size: 12 });
    y -= 20;

    const totalDaysPresent = detail.dailyRecords.filter(r => r.isPresent).length;
    const totalDays = detail.dailyRecords.length;
    const totalCommissions = detail.dailyRecords
      .filter(r => r.isPresent)
      .reduce((sum, r) => Number(sum) + Number(r.commission), 0);
    const totalBaseSalary = detail.dailyRecords
      .filter(r => r.isPresent)
      .reduce((sum, r) => Number(sum) + Number(r.adjustedRate), 0);

    drawText(`Base Salary: ${detail.baseSalaryUsed}`, margin + 10, y, { size: 10 });
    y -= 16;
    drawText(`Days Present: ${totalDaysPresent} / ${totalDays}`, margin + 10, y, { size: 10 });
    y -= 16;
    drawText(`Total Gross Pay: ${fmtCurrency(totalBaseSalary)}`, margin + 10, y, { size: 10 });
    y -= 16;
    drawText(`Total Commissions: ${fmtCurrency(totalCommissions)}`, margin + 10, y, { size: 10 });
    y -= 24;
    drawLine(margin, y, pageWidth - margin);
    y -= 20;

    // === ATTENDANCE TABLE ===
    checkPageBreak(60);
    drawText('Attendance', margin, y, { font: fontBold, size: 12 });
    y -= 18;

    // Table headers
    const colDate = margin;
    const colStatus = margin + 80;
    const colProject = margin + 140;
    const colRate = margin + 220;
    const colCommission = margin + 290;
    const colRemarks = margin + 370;

    drawText('Date', colDate, y, { font: fontBold, size: 9 });
    drawText('Status', colStatus, y, { font: fontBold, size: 9 });
    drawText('Project', colProject, y, { font: fontBold, size: 9 });
    drawText('Rate', colRate, y, { font: fontBold, size: 9 });
    drawText('Commission', colCommission, y, { font: fontBold, size: 9 });
    drawText('Remarks', colRemarks, y, { font: fontBold, size: 9 });
    y -= 4;
    drawLine(margin, y, pageWidth - margin);
    y -= 14;

    for (const record of detail.dailyRecords) {
      checkPageBreak(18);

      const dateStr = record.date;
      const date = new Date(dateStr);

      const formatted = date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      drawText(formatted, colDate, y, { size: 9 });
      drawText(record.isPresent ? 'Present' : 'Absent', colStatus, y, { size: 9 });
      drawText(record.assignedProjectName ?? '-', colProject, y, { size: 9 });
      drawText(fmtCurrency(record.adjustedRate), colRate, y, { size: 9 });
      drawText(fmtCurrency(record.commission), colCommission, y, { size: 9 });
      const remarks = (record.remarks || '-').substring(0, 30);
      drawText(remarks, colRemarks, y, { size: 9 });
      y -= 14;
    }

    y -= 10;
    drawLine(margin, y, pageWidth - margin);
    y -= 20;

    // === ADDITIONAL COMPENSATION ===
    checkPageBreak(60);
    drawText('Additional Compensation', margin, y, { font: fontBold, size: 12 });
    y -= 18;

    if (detail.additionalCompensation.length > 0) {
      for (const entry of detail.additionalCompensation) {
        checkPageBreak(16);
        drawText(entry.description, margin + 10, y, { size: 10 });
        drawText(fmtCurrency(entry.amount), pageWidth - margin - 80, y, { size: 10 });
        y -= 14;
      }
      const compTotal = detail.additionalCompensation.reduce((sum, e) => Number(sum) + Number(e.amount), 0);
      y -= 4;
      drawText('Subtotal:', margin + 10, y, { font: fontBold, size: 10 });
      drawText(fmtCurrency(compTotal), pageWidth - margin - 80, y, { font: fontBold, size: 10 });
      y -= 18;
    } else {
      drawText('None', margin + 10, y, { size: 10 });
      y -= 18;
    }

    drawLine(margin, y, pageWidth - margin);
    y -= 20;

    // === ADDITIONAL DEDUCTIONS ===
    checkPageBreak(60);
    drawText('Additional Deductions', margin, y, { font: fontBold, size: 12 });
    y -= 18;

    if (detail.additionalDeductions.length > 0) {
      for (const entry of detail.additionalDeductions) {
        checkPageBreak(16);
        drawText(entry.description, margin + 10, y, { size: 10 });
        drawText(fmtCurrency(entry.amount), pageWidth - margin - 80, y, { size: 10 });
        y -= 14;
      }
      const dedTotal = detail.additionalDeductions.reduce((sum, e) => Number(sum) + Number(e.amount), 0);
      y -= 4;
      drawText('Subtotal:', margin + 10, y, { font: fontBold, size: 10 });
      drawText(fmtCurrency(dedTotal), pageWidth - margin - 80, y, { font: fontBold, size: 10 });
      y -= 18;
    } else {
      drawText('None', margin + 10, y, { size: 10 });
      y -= 18;
    }

    drawLine(margin, y, pageWidth - margin);
    y -= 20;

    // === BENEFITS DEDUCTIONS ===
    checkPageBreak(80);
    drawText('Benefits Deductions', margin, y, { font: fontBold, size: 12 });
    y -= 18;

    drawText('Pag-Ibig', margin + 10, y, { size: 10 });
    drawText(fmtCurrency(detail.governmentDeductions.pagIbig), pageWidth - margin - 80, y, { size: 10 });
    y -= 14;
    drawText('Philhealth', margin + 10, y, { size: 10 });
    drawText(fmtCurrency(detail.governmentDeductions.philhealth), pageWidth - margin - 80, y, { size: 10 });
    y -= 14;
    drawText('SSS', margin + 10, y, { size: 10 });
    drawText(fmtCurrency(detail.governmentDeductions.sss), pageWidth - margin - 80, y, { size: 10 });
    y -= 18;

    const govTotal = Number(detail.governmentDeductions.pagIbig) + Number(detail.governmentDeductions.philhealth) + Number(detail.governmentDeductions.sss);
    drawText('Subtotal:', margin + 10, y, { font: fontBold, size: 10 });
    drawText(fmtCurrency(govTotal), pageWidth - margin - 80, y, { font: fontBold, size: 10 });
    y -= 18;

    drawLine(margin, y, pageWidth - margin);
    y -= 24;

    // === NET PAY ===
    checkPageBreak(40);
    drawText('NET PAY', margin, y, { font: fontBold, size: 14 });
    drawText(fmtCurrency(detail.payoutAmount), pageWidth - margin - 100, y, { font: fontBold, size: 14 });
    y -= 20;

    // // === SAVE AND DOWNLOAD ===
    // const pdfBytes = await pdfDoc.save();
    // const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
    // const url = URL.createObjectURL(blob);
    // const link = document.createElement('a');
    // link.href = url;
    // const employeeName = detail.employeeName.replace(/\s+/g, '_');
    // link.download = `payslip_${employeeName}_${detail.cutoffStart}_${detail.cutoffEnd}.pdf`;
    // link.click();
    // URL.revokeObjectURL(url);
    // === SAVE AND PREVIEW ===
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // Open in a new tab
    window.open(url, '_blank');

    // (Optional) revoke the object URL later to free memory
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
