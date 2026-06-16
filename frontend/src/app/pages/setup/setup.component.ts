import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { apiClient } from '../../shared/services/api-client';

type SetupStep = 'checking' | 'not-blank' | 'ready' | 'initializing' | 'create-admin' | 'complete' | 'error';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
})
export class SetupComponent implements OnInit {
  step: SetupStep = 'checking';
  error = '';
  progress = '';
  progressPercent = 0;
  progressDetail = '';

  adminForm = {
    fullName: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
  };
  adminError = '';
  isCreatingAdmin = false;
  isRestoring = false;
  restoreFile: File | null = null;

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    void this.checkDatabase();
  }

  private async checkDatabase(): Promise<void> {
    this.step = 'checking';
    this.error = '';

    try {
      const response = await apiClient.get<{ success: boolean; isBlank: boolean }>('/database-backup/check-blank', { timeout: 0 });
      if (response.data.isBlank) {
        this.step = 'ready';
      } else {
        this.step = 'not-blank';
      }
    } catch (err: any) {
      this.error = err?.response?.data?.message ?? err?.message ?? 'Unable to connect to the server.';
      this.step = 'error';
    }
  }

  async initializeSchema(): Promise<void> {
    this.step = 'initializing';
    this.progress = 'Starting schema initialization...';
    this.progressPercent = 0;
    this.progressDetail = '';
    this.error = '';

    try {
      // Start the migration (returns immediately)
      const response = await apiClient.post<{ success: boolean; message: string }>('/database-backup/setup-schema', {}, { timeout: 0 });
      if (!response.data.success) {
        this.error = response.data.message || 'Failed to start schema initialization.';
        this.step = 'error';
        return;
      }

      // Poll for progress
      await this.pollSetupProgress();
    } catch (err: any) {
      this.error = err?.response?.data?.message ?? err?.message ?? 'Schema initialization failed.';
      this.step = 'error';
    }
  }

  private async pollSetupProgress(): Promise<void> {
    const poll = async (): Promise<void> => {
      try {
        const res = await apiClient.get<{
          status: 'idle' | 'running' | 'done' | 'error';
          progress: number;
          total: number;
          message: string;
          error: string;
        }>('/database-backup/setup-schema/status', { timeout: 10000 });

        const data = res.data;
        this.progress = data.message || 'Working...';
        this.progressDetail = data.total > 0 ? `${data.progress} / ${data.total}` : '';
        this.progressPercent = data.total > 0 ? Math.round((data.progress / data.total) * 100) : 0;

        if (data.status === 'done') {
          this.progressPercent = 100;
          this.step = 'create-admin';
          return;
        }

        if (data.status === 'error') {
          this.error = data.error || 'Schema initialization failed.';
          this.step = 'error';
          return;
        }

        // Still running — poll again in 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        await poll();
      } catch {
        // If polling fails, wait and retry
        await new Promise(resolve => setTimeout(resolve, 3000));
        await poll();
      }
    };

    await poll();
  }

  async createAdmin(): Promise<void> {
    this.adminError = '';

    if (!this.adminForm.fullName.trim()) {
      this.adminError = 'Full name is required.';
      return;
    }
    if (!this.adminForm.username.trim()) {
      this.adminError = 'Username is required.';
      return;
    }
    if (!this.adminForm.password || this.adminForm.password.length < 6) {
      this.adminError = 'Password must be at least 6 characters.';
      return;
    }
    if (this.adminForm.password !== this.adminForm.confirmPassword) {
      this.adminError = 'Passwords do not match.';
      return;
    }

    this.isCreatingAdmin = true;

    try {
      const response = await apiClient.post<{ success: boolean; message: string }>('/database-backup/setup-admin', {
        fullName: this.adminForm.fullName.trim(),
        username: this.adminForm.username.trim(),
        password: this.adminForm.password,
        email: this.adminForm.email.trim() || undefined,
      });

      if (response.data.success) {
        this.step = 'complete';
      } else {
        this.adminError = response.data.message || 'Failed to create admin user.';
      }
    } catch (err: any) {
      this.adminError = err?.response?.data?.message ?? err?.message ?? 'Failed to create admin user.';
    } finally {
      this.isCreatingAdmin = false;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/']);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.restoreFile = input.files?.[0] ?? null;
  }

  async restoreFromBackup(): Promise<void> {
    if (!this.restoreFile) {
      this.error = 'Please select a .sql backup file.';
      return;
    }

    this.step = 'initializing';
    this.progress = 'Restoring database from backup file...';
    this.error = '';
    this.isRestoring = true;

    try {
      const formData = new FormData();
      formData.append('file', this.restoreFile);

      const response = await apiClient.post<{ success: boolean; message: string }>(
        '/database-backup/import',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 },
      );

      if (response.data.success) {
        this.progress = response.data.message || 'Database restored successfully!';
        // After restore, DB has users already — go to complete
        this.step = 'complete';
      } else {
        this.error = response.data.message || 'Restore failed.';
        this.step = 'error';
      }
    } catch (err: any) {
      this.error = err?.response?.data?.message ?? err?.message ?? 'Restore failed.';
      this.step = 'error';
    } finally {
      this.isRestoring = false;
    }
  }

  retry(): void {
    void this.checkDatabase();
  }
}
