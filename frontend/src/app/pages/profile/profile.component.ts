
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { AuthService } from '../../shared/services/auth.service';
import { NotificationService } from '../../shared/services/notification.service';
import { RbacService } from '../../shared/services/rbac.service';
import { UserManagementService } from '../../shared/services/user-management.service';

@Component({
  selector: 'app-profile',
  imports: [
    CommonModule,
    FormsModule,
    PageBreadcrumbComponent,
  ],
  templateUrl: './profile.component.html',
  styles: ``
})
export class ProfileComponent implements OnInit {
  private readonly profileImageStorageKey = 'user_profile_image';
  private readonly profileNameStorageKey = 'user_profile_name';
  private readonly profileEmailStorageKey = 'user_profile_email';

  isLoading = false;
  isSaving = false;
  isChangingPassword = false;

  form = {
    fullName: '',
    address: '',
    contact: '',
    birthdate: '',
    email: '',
    profileImage: '',
  };

  passwordForm = {
    currentPassword: '',
    newPassword: '',
    retryNewPassword: '',
  };
  authorizationPassword = '';

  constructor(
    private readonly userManagementService: UserManagementService,
    private readonly rbacService: RbacService,
    private readonly notificationService: NotificationService,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    void this.loadProfile();
  }

  get profilePreviewImage(): string {
    return this.form.profileImage || '/images/user/faceless-avatar.svg';
  }

  async loadProfile(): Promise<void> {
    const userId = this.rbacService.getUserId();
    if (!userId) {
      this.notificationService.error('Error', 'Unable to determine current user account.');
      return;
    }

    this.isLoading = true;
    try {
      const response = await this.userManagementService.getUserById(userId);
      if (!response.success || !response.data) {
        this.notificationService.error('Error', response.message || 'Unable to load profile information.');
        return;
      }

      const user = response.data;
      const fullName = String(user.fullname ?? user.fullName ?? user.full_name ?? '').trim();
      const email = String(user.email ?? '').trim();
      const image = String(
        user.profileImage ?? user.profile_image ?? user.avatar ?? user.avatarUrl ?? localStorage.getItem(this.profileImageStorageKey) ?? '',
      ).trim();

      this.form.fullName = fullName;
      this.form.address = String(user.address ?? '').trim();
      this.form.contact = String(user.contact ?? '').trim();
      this.form.birthdate = this.toDateInputValue(user.birthdate);
      this.form.email = email;
      this.form.profileImage = image;
    } catch {
      this.notificationService.error('Error', 'Unable to load profile information.');
    } finally {
      this.isLoading = false;
    }
  }

  async onProfileImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.notificationService.warning('Invalid file', 'Please select an image file.');
      return;
    }

    const dataUrl = await this.fileToDataUrl(file);
    this.form.profileImage = dataUrl;
  }

  removeProfileImage(): void {
    this.form.profileImage = '';
  }

  async saveProfile(): Promise<void> {
    if (this.isSaving) {
      return;
    }

    const userId = this.rbacService.getUserId();
    if (!userId) {
      this.notificationService.error('Error', 'Unable to determine current user account.');
      return;
    }

    const fullName = String(this.form.fullName || '').trim();
    const email = String(this.form.email || '').trim();

    if (!fullName) {
      this.notificationService.warning('Validation', 'Full name is required.');
      return;
    }

    if (!email) {
      this.notificationService.warning('Validation', 'Email is required.');
      return;
    }

    const authorizationPassword = String(this.authorizationPassword || '').trim();
    if (!authorizationPassword) {
      this.notificationService.warning('Validation', 'Enter your password to authorize profile changes.');
      return;
    }

    this.isSaving = true;
    try {
      const response = await this.userManagementService.updateUser(userId, {
        fullname: fullName,
        address: String(this.form.address || '').trim(),
        contact: String(this.form.contact || '').trim(),
        birthdate: this.form.birthdate || undefined,
        email,
        profileImage: this.form.profileImage || undefined,
        authorizationPassword,
      });

      if (!response.success) {
        this.notificationService.error('Error', response.message || 'Failed to update profile.');
        return;
      }

      localStorage.setItem(this.profileNameStorageKey, fullName);
      localStorage.setItem(this.profileEmailStorageKey, email);
      if (this.form.profileImage) {
        localStorage.setItem(this.profileImageStorageKey, this.form.profileImage);
      } else {
        localStorage.removeItem(this.profileImageStorageKey);
      }

      this.notificationService.success('Success', 'Profile updated successfully.');
      this.authorizationPassword = '';
      await this.loadProfile();
    } catch {
      this.notificationService.error('Error', 'Failed to update profile.');
    } finally {
      this.isSaving = false;
    }
  }

  async changePassword(): Promise<void> {
    if (this.isChangingPassword) {
      return;
    }

    const userId = this.rbacService.getUserId();
    if (!userId) {
      this.notificationService.error('Error', 'Unable to determine current user account.');
      return;
    }

    const currentPassword = String(this.passwordForm.currentPassword || '').trim();
    const newPassword = String(this.passwordForm.newPassword || '').trim();
    const retryNewPassword = String(this.passwordForm.retryNewPassword || '').trim();

    if (!currentPassword || !newPassword || !retryNewPassword) {
      this.notificationService.warning('Validation', 'Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 6) {
      this.notificationService.warning('Validation', 'New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== retryNewPassword) {
      this.notificationService.warning('Validation', 'Retry New Password does not match New Password.');
      return;
    }

    this.isChangingPassword = true;
    try {
      const response = await this.userManagementService.changePassword(userId, {
        currentPassword,
        newPassword,
      });

      if (!response.success) {
        this.notificationService.error('Error', response.message || 'Failed to change password.');
        return;
      }

      this.notificationService.success('Success', 'Password changed. Please sign in again.');

      this.passwordForm.currentPassword = '';
      this.passwordForm.newPassword = '';
      this.passwordForm.retryNewPassword = '';

      localStorage.removeItem(this.profileImageStorageKey);
      localStorage.removeItem(this.profileNameStorageKey);
      localStorage.removeItem(this.profileEmailStorageKey);

      this.authService.logout();
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch {
      this.notificationService.error('Error', 'Failed to change password.');
    } finally {
      this.isChangingPassword = false;
    }
  }

  private toDateInputValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Unable to read file.'));
      };
      reader.onerror = () => reject(new Error('Unable to read file.'));
      reader.readAsDataURL(file);
    });
  }

}
