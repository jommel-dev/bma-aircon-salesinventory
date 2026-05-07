import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IdleSessionService } from './shared/services/idle-session.service';
import { NotificationToastComponent } from './shared/components/common/notification-toast/notification-toast.component';
import { RbacService } from './shared/services/rbac.service';
import { Title } from '@angular/platform-browser';
import { BusinessSettingsService } from './shared/services/business-settings.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterModule,
    NotificationToastComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  constructor(
    private readonly idleSessionService: IdleSessionService,
    private readonly rbacService: RbacService,
    private readonly businessSettingsService: BusinessSettingsService,
    private readonly titleService: Title,
  ) { }

  ngOnInit(): void {
    this.idleSessionService.start();
    void this.rbacService.syncEffectivePermissions();
    // void this.appTitle();
  }

  get isIdlePromptVisible(): boolean {
    return this.idleSessionService.idlePromptVisible;
  }

  continueIdleSession(): void {
    this.idleSessionService.respondToIdlePrompt(true);
  }

  endIdleSession(): void {
    this.idleSessionService.respondToIdlePrompt(false);
  }

  // private async appTitle(): Promise<void> {
  //   try {
  //     await this.businessSettingsService.getBusinessProfile();
  //     const businessName = this.businessSettingsService.currentBusiness?.name;
  //     if (businessName) {
  //       // Extract the part after the pipe (if it exists) to keep the page name
  //       const currentTitleParts = this.titleService.getTitle().split(' | ');
  //       const pageName = currentTitleParts.length > 1 ? currentTitleParts[currentTitleParts.length - 1] : currentTitleParts[0];

  //       this.titleService.setTitle(`${businessName} | ${pageName}`);
  //     }
  //   } catch (error) {
  //     console.error('Failed to load business profile for title', error);
  //   }
  // }

  title = 'FWDS HVAC and SALES MIS | Login';
}
