import { Component } from '@angular/core';
import { DropdownComponent } from '../../ui/dropdown/dropdown.component';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DropdownItemTwoComponent } from '../../ui/dropdown/dropdown-item/dropdown-item.component-two';
import { AuthService } from '../../../services/auth.service';
import { RbacService } from '../../../services/rbac.service';

@Component({
  selector: 'app-user-dropdown',
  templateUrl: './user-dropdown.component.html',
  imports:[CommonModule,RouterModule,DropdownComponent,DropdownItemTwoComponent]
})
export class UserDropdownComponent {
  private readonly profileImageStorageKey = 'user_profile_image';
  readonly defaultAvatar = '/images/user/faceless-avatar.svg';

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly rbacService: RbacService,
  ) {}

  isOpen = false;

  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  closeDropdown() {
    this.isOpen = false;
  }

  get displayName(): string {
    return this.rbacService.getDisplayName();
  }

  get email(): string {
    return this.rbacService.getEmail();
  }

  get avatarSrc(): string {
    return localStorage.getItem(this.profileImageStorageKey) || this.defaultAvatar;
  }

  async onSignOut() {
    this.authService.logout();
    this.closeDropdown();
    await this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
