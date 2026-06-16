import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { QuotationFormComponent } from './quotation-form.component';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

/**
 * Routable page wrapper for QuotationFormComponent.
 * Reads the :id route param (if present) and passes it to the form component.
 */
@Component({
  selector: 'app-quotation-form-page',
  standalone: true,
  imports: [QuotationFormComponent, PageBreadcrumbComponent],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
      <app-page-breadcrumb [pageTitle]="pageTitle" />
      <div class="mt-4">
        <app-quotation-form
          [orderId]="orderId"
          (saved)="onSaved()"
          (cancelled)="onCancelled()"
        />
      </div>
    </div>
  `,
})
export class QuotationFormPageComponent implements OnInit {
  orderId?: number;
  pageTitle = 'Create Quotation';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const parsed = Number(idParam);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.orderId = parsed;
        this.pageTitle = 'Edit Quotation';
      }
    }
  }

  onSaved(): void {
    this.router.navigate(['/users/quotation']);
  }

  onCancelled(): void {
    this.router.navigate(['/users/quotation']);
  }
}
