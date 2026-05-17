import { BadRequestException, Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { Permissions } from 'src/auth/permissions.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateCutoffDto } from './dto/create-cutoff.dto';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('employees')
  @Permissions(['payroll.view'])
  async getEmployees(
    @Query('position') position?: string,
    @Query('projectId') projectId?: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const parsedProjectId = projectId ? Number(projectId) : undefined;
    const data = await this.payrollService.getEmployees({
      position: position || undefined,
      projectId:
        parsedProjectId && Number.isFinite(parsedProjectId)
          ? parsedProjectId
          : undefined,
    });
    return { success: true, data };
  }

  @Post('employees')
  @Permissions(['payroll.employee.create'])
  async createEmployee(
    @Body() dto: CreateEmployeeDto,
    @Req() request: { user?: Record<string, unknown> },
  ): Promise<{ success: boolean; data: unknown }> {
    const userId = this.toPositiveNumber(request.user?.sub);
    const createdEmployee = await this.payrollService.createEmployee(dto, userId);
    return { success: true, data: createdEmployee };
  }

  @Get('employees/:id/summary')
  @Permissions(['payroll.view'])
  async getEmployeeSummary(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const summary = await this.payrollService.getEmployeeSummary(Number(id));
    return { success: true, data: summary };
  }

  @Patch('employees/:id')
  @Permissions(['payroll.employee.edit'])
  async updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<{ success: boolean; data?: unknown; message?: string }> {
    try {
      const updatedEmployee = await this.payrollService.updateEmployee(Number(id), dto);
      return { success: true, data: updatedEmployee };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { success: false, message: 'Employee not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  @Get('employees/:id/cutoffs')
  @Permissions(['payroll.view'])
  async getEmployeeCutoffs(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: unknown }> {
    const cutoffs = await this.payrollService.getEmployeeCutoffs(Number(id));
    return { success: true, data: cutoffs };
  }

  @Post('employees/:id/payroll')
  @Permissions(['payroll.create'])
  async createEmployeePayroll(
    @Param('id') id: string,
    @Body() dto: CreatePayrollDto,
    @Req() request: { user?: Record<string, unknown> },
  ): Promise<{ success: boolean; data?: unknown; message?: string }> {
    try {
      const userId = this.toPositiveNumber(request.user?.sub) ?? 0;
      const result = await this.payrollService.createEmployeePayroll(Number(id), dto, userId);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new HttpException(
          { success: false, message: 'Cutoff period overlaps with existing payroll' },
          HttpStatus.CONFLICT,
        );
      }
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { success: false, message: 'Employee not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      if (error instanceof BadRequestException) {
        throw new HttpException(
          { success: false, message: (error as BadRequestException).message },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  @Post('cutoffs')
  @Permissions(['payroll.create'])
  async createCutoff(
    @Body() dto: CreateCutoffDto,
    @Req() request: { user?: Record<string, unknown> },
  ): Promise<{ success: boolean; data?: unknown; message?: string }> {
    try {
      const userId = this.toPositiveNumber(request.user?.sub);
      const data = await this.payrollService.createCutoff(dto, userId);
      return { success: true, data };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new HttpException(
          { success: false, message: 'Cutoff period overlaps with existing payroll for selected employees' },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  @Get('records/:id/details')
  @Permissions(['payroll.cutoff.view'])
  async getPayrollRecordDetails(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data?: unknown; message?: string }> {
    try {
      const result = await this.payrollService.getPayrollRecordDetails(Number(id));
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { success: false, message: 'Payroll record not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  @Get('cutoffs/:id')
  @Permissions(['payroll.cutoff.view'])
  async getCutoffDetail(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data?: unknown; message?: string }> {
    try {
      const cutoffDetail = await this.payrollService.getCutoffDetail(Number(id));
      return { success: true, data: cutoffDetail };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { success: false, message: 'Cutoff not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      throw error;
    }
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
  }
}
