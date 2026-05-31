
import { Component } from '@angular/core';
import { LabelComponent } from '../../form/label/label.component';
import { CheckboxComponent } from '../../form/input/checkbox.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { InputFieldComponent } from '../../form/input/input-field.component';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { RbacService } from '../../../services/rbac.service';
import axios from 'axios';

// Maps menu keys to their route paths (order matters — first match wins)
const MENU_ROUTE_MAP: Array<{ menu: string; route: string }> = [
  { menu: 'dashboard', route: '/users/dashboard' },
  { menu: 'sales_order', route: '/users/sales-order' },
  { menu: 'projects', route: '/users/projects' },
  { menu: 'customers', route: '/users/customers' },
  { menu: 'today_schedule', route: '/users/schedule-today-sales-order' },
  { menu: 'purchase_order', route: '/users/purchase-order' },
  { menu: 'purchase_order_materials', route: '/users/purchase-order-materials' },
  { menu: 'inventory', route: '/users/inventory' },
  { menu: 'accounting', route: '/users/accounting' },
  { menu: 'payroll', route: '/users/payroll' },
  { menu: 'sales_order_materials', route: '/users/sales-order-materials' },
  { menu: 'quotation', route: '/users/quotation' },
  { menu: 'user_management', route: '/users/user-management' },
  { menu: 'settings', route: '/users/settings' },
];

@Component({
  selector: 'app-signin-form',
  imports: [
    LabelComponent,
    CheckboxComponent,
    ButtonComponent,
    InputFieldComponent,
    RouterModule,
    FormsModule
],
  templateUrl: './signin-form.component.html',
  styles: ``
})
export class SigninFormComponent {
  constructor(
    private readonly authService: AuthService,
    private readonly rbacService: RbacService,
    private readonly router: Router,
  ) {}

  showPassword = false;
  isChecked = false;

  username = '';
  password = '';
  isSubmitting = false;
  errorMessage = '';

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async onSignIn() {
    if (this.isSubmitting) {
      return;
    }

    this.errorMessage = '';
    this.isSubmitting = true;

    try {
      const result = await this.authService.login(this.username, this.password, this.isChecked);

      if (!result.success) {
        this.errorMessage = result.message ?? 'Invalid username or password';
        return;
      }

      await this.router.navigateByUrl(this.resolveFirstAllowedRoute());
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.errorMessage =
          (error.response?.data as { message?: string } | undefined)?.message ??
          'Unable to reach backend API';
      } else {
        this.errorMessage = 'Unexpected error during sign in';
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  private resolveFirstAllowedRoute(): string {
    const allowedMenus = this.rbacService.getAllowedMenus();

    // Find the first menu in MENU_ROUTE_MAP that the user has access to
    for (const entry of MENU_ROUTE_MAP) {
      if (allowedMenus.has(entry.menu)) {
        return entry.route;
      }
    }

    // Fallback to dashboard if no menus matched
    return '/users/dashboard';
  }
}
