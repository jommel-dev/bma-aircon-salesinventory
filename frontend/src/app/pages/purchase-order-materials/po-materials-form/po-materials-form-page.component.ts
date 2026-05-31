import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PoMaterialsFormComponent } from './po-materials-form.component';
import { PageBreadcrumbComponent } from '../../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

/**
 * Routable page wrapper for PoMaterialsFormComponent.
 * Reads the :id route param (if present) and passes it to the form component.
 */
@Component({
  selector: 'app-po-materials-form-page',
  standalone: true,
  imports: [PoMaterialsFormComponent, PageBreadcrumbComponent],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
      <app-page-breadcrumb [pageTitle]="pageTitle" />
      <div class="mt-4">
        <app-po-materials-form
          [orderId]="orderId"
          (saved)="onSaved()"
          (cancelled)="onCancelled()"
        />
      </div>
    </div>
  `,
})
export class PoMaterialsFormPageComponent implements OnInit {
  orderId?: number;
  pageTitle = 'Create PO Materials';

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
        this.pageTitle = 'Edit PO Materials';
      }
    }
  }

  onSaved(): void {
    this.router.navigate(['/users/purchase-order-materials']);
  }

  onCancelled(): void {
    this.router.navigate(['/users/purchase-order-materials']);
  }
}
