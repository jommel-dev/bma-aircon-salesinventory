import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { BusinessSettingsService } from './business-settings.service';

@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private websiteTabName = '3BMA Aircondition Inveentory and Sales Management';
  private routingTabName = '{route}';
  private hasRequestedProfile = false;
  private currentRouteTitle = 'Home';

  constructor(
    private readonly browserTitle: Title,
    private readonly businessSettingsService: BusinessSettingsService,
  ) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const builtRouteTitle = this.buildTitle(snapshot);
    this.currentRouteTitle = builtRouteTitle && builtRouteTitle.trim().length > 0 ? builtRouteTitle.trim() : 'Home';

    this.applyTitle();

    // Business profile API call disabled — use default title to avoid slow load
  }

  private async loadProfileTitles(): Promise<void> {
    // Disabled — was causing login page timeout
  }

  private applyTitle(): void {
    const routeLabel = this.resolveRouteLabel(this.currentRouteTitle);
    this.browserTitle.setTitle(`${this.websiteTabName} | ${routeLabel}`);
  }

  private resolveRouteLabel(routeTitle: string): string {
    const template = String(this.routingTabName ?? '').trim();
    const normalizedRouteTitle = String(routeTitle ?? '').trim() || 'Home';

    if (!template) {
      return normalizedRouteTitle;
    }

    if (template.includes('{route}')) {
      return template.replaceAll('{route}', normalizedRouteTitle);
    }

    return template;
  }
}
