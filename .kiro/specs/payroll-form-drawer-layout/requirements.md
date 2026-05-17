# Requirements Document

## Introduction

Convert the payroll employee forms (Add Employee and Edit Employee) from modal dialog presentation to a drawer (slide-in panel) layout. The drawer slides in from the right side of the viewport. Additionally, reorganize the form fields into a specific grid arrangement that groups related fields logically and improves visual hierarchy.

## Glossary

- **Drawer**: A slide-in panel that appears from the right edge of the viewport, overlaying the main content with a backdrop. It remains visible until explicitly closed by the user.
- **Form_Grid**: The CSS grid layout structure used to arrange form fields within the drawer body.
- **Add_Employee_Drawer**: The drawer panel used to create a new payroll employee record.
- **Edit_Employee_Drawer**: The drawer panel used to modify an existing payroll employee record.
- **Backdrop**: A semi-transparent overlay behind the drawer that dims the main content and can be clicked to close the drawer.
- **PayrollComponent**: The Angular standalone component that manages the payroll page, including employee listing, forms, and payroll records.

## Requirements

### Requirement 1: Drawer Container Presentation

**User Story:** As a payroll administrator, I want employee forms to appear as a slide-in drawer from the right side, so that I can fill in employee details without losing context of the main payroll page.

#### Acceptance Criteria

1. WHEN the user clicks the "Add Employee" button, THE Add_Employee_Drawer SHALL slide in from the right edge of the viewport with a smooth transition animation.
2. WHEN the user clicks the "Settings" button for a selected employee, THE Edit_Employee_Drawer SHALL slide in from the right edge of the viewport with a smooth transition animation.
3. WHILE the Add_Employee_Drawer is open, THE Backdrop SHALL be displayed behind the drawer to dim the main content.
4. WHILE the Edit_Employee_Drawer is open, THE Backdrop SHALL be displayed behind the drawer to dim the main content.
5. WHEN the user clicks the Backdrop, THE PayrollComponent SHALL close the currently open drawer.
6. WHEN the user clicks the close button (X) inside the drawer header, THE PayrollComponent SHALL close the currently open drawer.
7. THE Add_Employee_Drawer SHALL have a fixed width appropriate for form content (maximum width of 600px) and occupy the full viewport height.
8. THE Edit_Employee_Drawer SHALL have a fixed width appropriate for form content (maximum width of 600px) and occupy the full viewport height.
9. WHILE a drawer is open, THE Drawer SHALL allow vertical scrolling of its body content when the form exceeds the visible area.

### Requirement 2: Add Employee Form Grid Layout

**User Story:** As a payroll administrator, I want the Add Employee form fields arranged in a structured grid layout, so that related fields are visually grouped and the form is easy to scan.

#### Acceptance Criteria

1. THE Form_Grid SHALL arrange the Full Name field and Department field side by side in the first row, each occupying half the available width.
2. THE Form_Grid SHALL arrange the Position field and Base Salary field side by side in the second row, each occupying half the available width.
3. THE Form_Grid SHALL place the Project field in the third row, occupying half the available width (left-aligned).
4. THE Form_Grid SHALL arrange the Pag-Ibig, Philhealth, and SSS fields side by side in the fourth row, each occupying one-third of the available width.
5. THE Form_Grid SHALL place the Contact Number field in the fifth row, occupying the full available width.
6. THE Form_Grid SHALL place the Address field in the sixth row, occupying the full available width.

### Requirement 3: Edit Employee Form Grid Layout

**User Story:** As a payroll administrator, I want the Edit Employee form fields arranged in the same structured grid layout as the Add form, so that the experience is consistent across both create and edit workflows.

#### Acceptance Criteria

1. THE Edit_Employee_Drawer SHALL use the same Form_Grid layout as the Add_Employee_Drawer.
2. THE Form_Grid SHALL arrange the Full Name field and Department field side by side in the first row, each occupying half the available width.
3. THE Form_Grid SHALL arrange the Position field and Base Salary field side by side in the second row, each occupying half the available width.
4. THE Form_Grid SHALL place the Project field in the third row, occupying half the available width (left-aligned).
5. THE Form_Grid SHALL arrange the Pag-Ibig, Philhealth, and SSS fields side by side in the fourth row, each occupying one-third of the available width.
6. THE Form_Grid SHALL place the Contact Number field in the fifth row, occupying the full available width.
7. THE Form_Grid SHALL place the Address field in the sixth row, occupying the full available width.

### Requirement 4: Drawer Header and Footer

**User Story:** As a payroll administrator, I want clear header and footer sections in the drawer, so that I can identify the form purpose and access action buttons without scrolling.

#### Acceptance Criteria

1. THE Add_Employee_Drawer SHALL display a fixed header containing the title "Add Employee" and a close button (X icon).
2. THE Edit_Employee_Drawer SHALL display a fixed header containing the title "Edit Employee" and a close button (X icon).
3. THE Add_Employee_Drawer SHALL display a fixed footer containing a "Cancel" button and a "Save Employee" submit button.
4. THE Edit_Employee_Drawer SHALL display a fixed footer containing a "Cancel" button and a "Save Changes" submit button.
5. WHILE the form is being submitted, THE submit button SHALL display a loading state text ("Saving...") and be disabled to prevent duplicate submissions.

### Requirement 5: Responsive Behavior

**User Story:** As a payroll administrator using a mobile device, I want the drawer and form grid to adapt to smaller screens, so that the form remains usable on all device sizes.

#### Acceptance Criteria

1. WHILE the viewport width is below 640px (sm breakpoint), THE Form_Grid SHALL stack all fields in a single column layout.
2. WHILE the viewport width is below 640px, THE Drawer SHALL occupy the full viewport width.
3. WHILE the viewport width is 640px or above, THE Form_Grid SHALL use the multi-column grid arrangement as specified in Requirements 2 and 3.

### Requirement 6: Edit Employee Form Location Change

**User Story:** As a payroll administrator, I want the Edit Employee form to appear as a drawer instead of an inline panel within the employee detail section, so that the presentation is consistent with the Add Employee form.

#### Acceptance Criteria

1. WHEN the user clicks the "Settings" button, THE PayrollComponent SHALL open the Edit_Employee_Drawer instead of displaying an inline form panel within the employee detail section.
2. THE PayrollComponent SHALL remove the inline edit form panel that previously appeared below the employee heading in the right content area.
