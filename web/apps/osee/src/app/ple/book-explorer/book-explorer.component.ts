import { Component, inject } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { BranchPickerComponent } from '@osee/shared/components';
import { BranchRoutedUIService } from '@osee/shared/services';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'osee-book-explorer',
  standalone: true,
  imports: [MatTabsModule, MatButtonModule, BranchPickerComponent, AsyncPipe],
  template: `
    <mat-tab-group>
      <mat-tab label="SRS Book">
        <div class="tw-p-4">
            <osee-branch-picker />
            <div class="tw-mt-4">
                Selected Branch: {{ branchId | async }}
            </div>
            <button mat-raised-button color="primary" class="tw-mt-4">Do Work</button>
        </div>
      </mat-tab>
      <mat-tab label="Color Book">
        <div class="tw-p-4">
            <osee-branch-picker />
             <div class="tw-mt-4">
                Selected Branch: {{ branchId | async }}
            </div>
            <button mat-raised-button color="primary" class="tw-mt-4">Do Work</button>
        </div>
      </mat-tab>
      <mat-tab label="Subsystem Book">
        <div class="tw-p-4">
            <osee-branch-picker />
             <div class="tw-mt-4">
                Selected Branch: {{ branchId | async }}
            </div>
            <button mat-raised-button color="primary" class="tw-mt-4">Do Work</button>
        </div>
      </mat-tab>
    </mat-tab-group>
  `
})
export class BookExplorerComponent {
    private branchService = inject(BranchRoutedUIService);
    branchId = this.branchService.id;
}

export default BookExplorerComponent;
