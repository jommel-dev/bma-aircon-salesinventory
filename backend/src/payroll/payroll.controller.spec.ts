import { PayrollController } from './payroll.controller';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from 'src/auth/permission.guard';
import { PERMISSIONS_KEY } from 'src/auth/permissions.decorator';
import { GUARDS_METADATA } from '@nestjs/common/constants';

/**
 * Tests that verify the permission guard integration on all payroll endpoints.
 * These tests use reflection to verify decorators are correctly applied
 * without needing to instantiate the full NestJS module.
 *
 * Validates: Requirements 9.8, 1.2
 */
describe('PayrollController - Permission Guard Integration', () => {
  const reflector = new Reflector();

  describe('Class-level guards', () => {
    it('should have JwtAuthGuard and PermissionGuard applied at class level', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, PayrollController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(PermissionGuard);
    });

    it('should apply JwtAuthGuard before PermissionGuard (order matters)', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, PayrollController);
      const jwtIndex = guards.indexOf(JwtAuthGuard);
      const permIndex = guards.indexOf(PermissionGuard);
      expect(jwtIndex).toBeLessThan(permIndex);
    });
  });

  describe('Endpoint permissions', () => {
    it('GET /payroll/employees should require payroll.view permission', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        PayrollController.prototype.getEmployees,
      );
      expect(permissions).toEqual(['payroll.view']);
    });

    it('POST /payroll/employees should require payroll.employee.create permission', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        PayrollController.prototype.createEmployee,
      );
      expect(permissions).toEqual(['payroll.employee.create']);
    });

    it('PATCH /payroll/employees/:id should require payroll.employee.edit permission', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        PayrollController.prototype.updateEmployee,
      );
      expect(permissions).toEqual(['payroll.employee.edit']);
    });

    it('GET /payroll/employees/:id/summary should require payroll.view permission', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        PayrollController.prototype.getEmployeeSummary,
      );
      expect(permissions).toEqual(['payroll.view']);
    });

    it('GET /payroll/employees/:id/cutoffs should require payroll.view permission', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        PayrollController.prototype.getEmployeeCutoffs,
      );
      expect(permissions).toEqual(['payroll.view']);
    });

    it('POST /payroll/cutoffs should require payroll.create permission', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        PayrollController.prototype.createCutoff,
      );
      expect(permissions).toEqual(['payroll.create']);
    });

    it('GET /payroll/cutoffs/:id should require payroll.cutoff.view permission', () => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        PayrollController.prototype.getCutoffDetail,
      );
      expect(permissions).toEqual(['payroll.cutoff.view']);
    });
  });

  describe('All endpoints have permissions defined', () => {
    it('every public method should have a @Permissions() decorator', () => {
      const controllerPrototype = PayrollController.prototype;
      const methodNames = Object.getOwnPropertyNames(controllerPrototype).filter(
        (name) => name !== 'constructor' && !name.startsWith('_') && typeof controllerPrototype[name] === 'function',
      );

      // Filter to only public endpoint methods (exclude private helpers)
      const publicMethods = methodNames.filter(
        (name) => !name.startsWith('to'), // exclude private helper methods like toPositiveNumber
      );

      for (const method of publicMethods) {
        const permissions = reflector.get<string[]>(
          PERMISSIONS_KEY,
          controllerPrototype[method],
        );
        expect(permissions).toBeDefined();
        expect(permissions.length).toBeGreaterThan(0);
      }
    });
  });
});
