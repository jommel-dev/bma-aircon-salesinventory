import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SidebarService } from '../../services/sidebar.service';
import { ThemeToggleButtonComponent } from '../../components/common/theme-toggle/theme-toggle-button.component';
import { UserDropdownComponent } from '../../components/header/user-dropdown/user-dropdown.component';
import { BranchSwitcherComponent } from '../../components/header/branch-switcher/branch-switcher.component';
import { BusinessSettingsService } from '../../services/business-settings.service';
import {
  GLOBAL_SEARCH_GROUPS,
  GlobalSearchItem,
  GlobalSearchService,
  GlobalSearchType,
} from '../../services/global-search.service';

@Component({
  selector: 'app-header',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ThemeToggleButtonComponent,
    UserDropdownComponent,
    BranchSwitcherComponent,
  ],
  templateUrl: './app-header.component.html',
})
export class AppHeaderComponent implements OnInit, OnDestroy {
  isApplicationMenuOpen = false;
  readonly isMobileOpen$;

  private readonly defaultBusinessLogoLight = '/images/fwdslogo.png';
  private readonly defaultBusinessLogoDark = '/images/fwdslogo-dark.png';
  logoLightSrc = this.defaultBusinessLogoLight;
  logoDarkSrc = this.defaultBusinessLogoDark;

  searchQuery = '';
  searchResults: GlobalSearchItem[] = [];
  isSearchOpen = false;
  isSearchLoading = false;
  activeResultIndex = -1;
  readonly searchGroups = GLOBAL_SEARCH_GROUPS;

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('searchRoot') searchRoot!: ElementRef<HTMLElement>;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;

  constructor(
    public sidebarService: SidebarService,
    private readonly businessSettingsService: BusinessSettingsService,
    private readonly globalSearchService: GlobalSearchService,
    private readonly router: Router,
  ) {
    this.isMobileOpen$ = this.sidebarService.isMobileOpen$;
  }

  ngOnInit(): void {
    void this.loadBusinessLogo();
    document.addEventListener('keydown', this.handleKeyDown);
  }

  ngOnDestroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  private async loadBusinessLogo(): Promise<void> {
    try {
      const settings = await this.businessSettingsService.getBusinessProfile();
      this.logoLightSrc = settings?.businessLogoLight || settings?.businessLogo || this.defaultBusinessLogoLight;
      this.logoDarkSrc = settings?.businessLogoDark || settings?.businessLogo || this.defaultBusinessLogoDark;
    } catch {
      this.logoLightSrc = this.defaultBusinessLogoLight;
      this.logoDarkSrc = this.defaultBusinessLogoDark;
    }
  }

  handleToggle() {
    if (window.innerWidth >= 1280) {
      this.sidebarService.toggleExpanded();
    } else {
      this.sidebarService.toggleMobileOpen();
    }
  }

  toggleApplicationMenu() {
    this.isApplicationMenuOpen = !this.isApplicationMenuOpen;
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
      this.isSearchOpen = true;
    }
  };

  onSearchFocus(): void {
    this.isSearchOpen = true;
    if (this.searchQuery.trim().length >= 2 && this.searchResults.length === 0) {
      void this.runSearch(this.searchQuery);
    }
  }

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.isSearchOpen = true;
    this.activeResultIndex = -1;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      this.searchResults = [];
      this.isSearchLoading = false;
      return;
    }
    this.isSearchLoading = true;
    this.searchTimer = setTimeout(() => {
      void this.runSearch(trimmed);
    }, 250);
  }

  private async runSearch(query: string): Promise<void> {
    const requestId = ++this.searchRequestId;
    try {
      const items = await this.globalSearchService.search(query);
      if (requestId !== this.searchRequestId) {
        return;
      }
      this.searchResults = items;
    } catch {
      if (requestId !== this.searchRequestId) {
        return;
      }
      this.searchResults = [];
    } finally {
      if (requestId === this.searchRequestId) {
        this.isSearchLoading = false;
      }
    }
  }

  resultsFor(type: GlobalSearchType): GlobalSearchItem[] {
    return this.searchResults.filter((item) => item.type === type);
  }

  get hasGroupedResults(): boolean {
    return this.searchResults.length > 0;
  }

  get showEmptyState(): boolean {
    return this.isSearchOpen && !this.isSearchLoading && this.searchQuery.trim().length >= 2 && !this.hasGroupedResults;
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeSearch();
      this.searchInput?.nativeElement.blur();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveActive(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.searchResults[this.activeResultIndex] ?? this.searchResults[0];
      if (item) {
        this.openResult(item);
      }
    }
  }

  private moveActive(delta: number): void {
    if (this.searchResults.length === 0) {
      return;
    }
    const next = this.activeResultIndex + delta;
    this.activeResultIndex = ((next % this.searchResults.length) + this.searchResults.length) % this.searchResults.length;
  }

  openResult(item: GlobalSearchItem): void {
    this.closeSearch();
    this.searchQuery = '';
    this.searchResults = [];
    void this.router.navigateByUrl(item.route);
  }

  closeSearch(): void {
    this.isSearchOpen = false;
    this.activeResultIndex = -1;
  }

  isActive(item: GlobalSearchItem): boolean {
    return this.searchResults[this.activeResultIndex] === item;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.searchRoot?.nativeElement.contains(event.target as Node)) {
      this.closeSearch();
    }
  }
}
