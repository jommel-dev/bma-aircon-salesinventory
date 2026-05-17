# Requirements Document

## Introduction

The Payroll Module provides a centralized interface for managing employee payroll within the Bagama HVAC system. It enables authorized users to add employees, generate payroll records per cutoff period, view payout summaries, and filter by position and project. The module follows the existing tree-view layout pattern (used in Accounting and Inventory) and integrates with the established RBAC system for permission-based access control.

## Glossary

- **Payroll_Module**: The frontend and backend subsystem responsible for employee payroll management, including employee records, payroll generation, and payout tracking.
- **Employee_List**: A tree-view sidebar panel displaying all employees with a smart search bar for filtering.
- **Payroll_Cutoff**: A defined date range (start date to end date) representing a single pay period for which payroll is generated.
- **Payout**: The computed monetary amount disbursed to an employee for a given payroll cutoff.
- **Position_Filter**: A dropdown filter in the page header that narrows the employee list by job position.
- **Project_Filter**: A dropdown filter in the page header that narrows the employee list by assigned project.
- **RBAC_System**: The existing Role-Based Access Control system using `auth_permission_keys` and `auth_role_permissions` tables to govern feature and action access.
- **Permission_Guard**: The NestJS guard (`PermissionGuard`) that validates user permissions on protected API endpoints.
- **Smart_Search**: A text input that performs fuzzy or substring matching against employee names and other identifying fields in real time.
- **Payroll_Report**: A summary view showing generated payroll count, current payout, and total payout for a selected employee.

## Requirements

### Requirement 1: Payroll Module Page Access

**User Story:** As an authorized user, I want to access the Payroll Module page, so that I can manage employee payroll records.

#### Acceptance Criteria

1. WHEN a user with the `payroll.view` permission navigates to the Payroll Module route, THE Payroll_Module SHALL render the page with a header titled "Payroll Reports".
2. IF a user without the `payroll.view` permission attempts to access the Payroll Module route, THEN THE Payroll_Module SHALL redirect the user to the dashboard and display no payroll content.
3. THE Payroll_Module SHALL display the page layout as a two-column grid: Employee_List sidebar on the left and content section on the right, consistent with the Accounting Module layout.

### Requirement 2: Header Filters

**User Story:** As a payroll manager, I want to filter employees by position and project, so that I can quickly narrow down the employee list to a relevant subset.

#### Acceptance Criteria

1. THE Payroll_Module SHALL display a Position_Filter dropdown in the page header populated with all distinct employee positions.
2. THE Payroll_Module SHALL display a Project_Filter dropdown in the page header populated with all active projects.
3. WHEN a user selects a value in the Position_Filter, THE Employee_List SHALL display only employees matching the selected position.
4. WHEN a user selects a value in the Project_Filter, THE Employee_List SHALL display only employees assigned to the selected project.
5. WHEN both Position_Filter and Project_Filter have selected values, THE Employee_List SHALL display only employees matching both criteria simultaneously.
6. WHEN a user clears a filter selection, THE Employee_List SHALL revert to showing all employees not excluded by other active filters.

### Requirement 3: Employee List (Tree View Sidebar)

**User Story:** As a payroll manager, I want to see a searchable list of employees in a tree-view sidebar, so that I can quickly find and select any employee.

#### Acceptance Criteria

1. THE Employee_List SHALL render as a vertical sidebar panel using the tree-view pattern consistent with the Accounting Module report tree.
2. THE Employee_List SHALL display each employee entry showing the employee full name.
3. THE Employee_List SHALL provide a Smart_Search input at the top of the sidebar that filters employees by name in real time as the user types.
4. WHEN a user clicks on an employee entry, THE Payroll_Module SHALL mark that entry as active and display the corresponding employee details in the content section.
5. WHEN the Employee_List contains no employees matching the current filters or search term, THE Employee_List SHALL display a placeholder message indicating no results found.

### Requirement 4: Add Employee

**User Story:** As a payroll manager, I want to add a new employee to the payroll system, so that I can generate payroll for newly hired staff.

#### Acceptance Criteria

1. WHEN a user with the `payroll.employee.create` permission clicks the "Add Employee" button, THE Payroll_Module SHALL open a form to capture employee details including full name, position, assigned project, and base salary.
2. WHEN the user submits a valid employee form, THE Payroll_Module SHALL persist the employee record to the database and add the employee to the Employee_List.
3. IF the user submits an employee form with missing required fields, THEN THE Payroll_Module SHALL display validation error messages next to each invalid field and prevent submission.
4. IF a user without the `payroll.employee.create` permission views the page, THEN THE Payroll_Module SHALL hide the "Add Employee" button.

### Requirement 5: Employee Content Section

**User Story:** As a payroll manager, I want to view an employee's payroll summary and details, so that I can monitor their compensation history.

#### Acceptance Criteria

1. WHEN an employee is selected from the Employee_List, THE Payroll_Module SHALL display the employee full name as the active heading in the content section.
2. THE Payroll_Module SHALL display a "Settings" button next to the employee name that serves as the "Edit Information" action for the selected employee.
3. THE Payroll_Module SHALL display three summary cards below the employee name: "Generated Payroll Count" showing the total number of payroll records, "Current Payout" showing the most recent payroll amount, and "Total Payout" showing the cumulative payout across all cutoffs.
4. THE Payroll_Module SHALL display a list of Payroll_Cutoff entries below the summary cards, each showing the cutoff date range and a "View" action button.

### Requirement 6: Edit Employee Information

**User Story:** As a payroll manager, I want to edit an employee's information, so that I can keep records accurate when positions or salaries change.

#### Acceptance Criteria

1. WHEN a user with the `payroll.employee.edit` permission clicks the "Settings" button for a selected employee, THE Payroll_Module SHALL open an edit form pre-populated with the employee's current details.
2. WHEN the user submits valid changes, THE Payroll_Module SHALL update the employee record in the database and reflect the changes in the Employee_List and content section.
3. IF the user submits invalid data, THEN THE Payroll_Module SHALL display validation error messages and prevent submission.
4. IF a user without the `payroll.employee.edit` permission views the content section, THEN THE Payroll_Module SHALL hide the "Settings" button.

### Requirement 7: Create Payroll

**User Story:** As a payroll manager, I want to generate a new payroll for a cutoff period, so that employee compensation is recorded and tracked.

#### Acceptance Criteria

1. WHEN a user with the `payroll.create` permission clicks the "Create Payroll" button, THE Payroll_Module SHALL open a form to define the payroll cutoff start date, end date, and select employees to include.
2. WHEN the user submits a valid payroll creation form, THE Payroll_Module SHALL generate payroll records for each selected employee based on their base salary and the defined cutoff period.
3. WHEN payroll generation completes successfully, THE Payroll_Module SHALL add the new Payroll_Cutoff entry to each included employee's cutoff list and update their summary cards.
4. IF the user submits a payroll form with an overlapping cutoff period for the same employees, THEN THE Payroll_Module SHALL display an error indicating the date range conflict and prevent duplicate generation.
5. IF a user without the `payroll.create` permission views the page, THEN THE Payroll_Module SHALL hide the "Create Payroll" button.

### Requirement 8: View Payroll Cutoff Details

**User Story:** As a payroll manager, I want to view the details of a specific payroll cutoff, so that I can review individual payout breakdowns.

#### Acceptance Criteria

1. WHEN a user clicks the "View" button on a Payroll_Cutoff entry, THE Payroll_Module SHALL display the detailed breakdown for that cutoff including the cutoff date range, base salary used, computed payout amount, and generation date.
2. THE Payroll_Module SHALL display the payroll cutoff details in a modal or expanded section within the content area.

### Requirement 9: Backend API Endpoints

**User Story:** As a frontend developer, I want well-defined backend API endpoints for payroll operations, so that the frontend can perform CRUD operations on employees and payroll records.

#### Acceptance Criteria

1. THE Payroll_Module backend SHALL expose a `GET /payroll/employees` endpoint that returns a list of employees with optional query parameters for position and project filtering.
2. THE Payroll_Module backend SHALL expose a `POST /payroll/employees` endpoint that creates a new employee record, protected by the `payroll.employee.create` permission.
3. THE Payroll_Module backend SHALL expose a `PATCH /payroll/employees/:id` endpoint that updates an existing employee record, protected by the `payroll.employee.edit` permission.
4. THE Payroll_Module backend SHALL expose a `GET /payroll/employees/:id/summary` endpoint that returns the generated payroll count, current payout, and total payout for a specific employee.
5. THE Payroll_Module backend SHALL expose a `GET /payroll/employees/:id/cutoffs` endpoint that returns the list of payroll cutoffs for a specific employee.
6. THE Payroll_Module backend SHALL expose a `POST /payroll/cutoffs` endpoint that generates payroll records for a defined cutoff period, protected by the `payroll.create` permission.
7. THE Payroll_Module backend SHALL expose a `GET /payroll/cutoffs/:id` endpoint that returns the detailed breakdown of a specific payroll cutoff.
8. WHEN any protected endpoint receives a request from a user without the required permission, THE Permission_Guard SHALL return a 403 Forbidden response.

### Requirement 10: RBAC Permission Migration

**User Story:** As a system administrator, I want payroll-specific permissions added to the RBAC system, so that I can control who can access and manage payroll features.

#### Acceptance Criteria

1. THE RBAC_System SHALL include the following permission keys in the `auth_permission_keys` table: `payroll.view` (feature scope), `payroll.employee.create` (action scope), `payroll.employee.edit` (action scope), `payroll.employee.delete` (action scope), `payroll.create` (action scope), `payroll.cutoff.view` (feature scope).
2. WHEN the migration executes, THE RBAC_System SHALL assign all payroll permission keys to the superadmin and admin roles.
3. WHEN the migration executes, THE RBAC_System SHALL assign all payroll permission keys to the Business Owner role.
4. THE RBAC_System SHALL register a `payroll` menu entry in the `auth_menus` table with the route `/payroll`, icon `payments`, and appropriate order number.
5. THE migration SHALL be idempotent, using `ON CONFLICT DO NOTHING` to prevent duplicate entries on re-execution.

### Requirement 11: Database Schema for Payroll

**User Story:** As a backend developer, I want a well-structured database schema for payroll data, so that employee and payroll records are stored reliably.

#### Acceptance Criteria

1. THE Payroll_Module SHALL create a `tblpayroll_employees` table with columns: id (BIGSERIAL PRIMARY KEY), full_name (VARCHAR NOT NULL), position (VARCHAR NOT NULL), project_id (BIGINT referencing the projects table), base_salary (NUMERIC NOT NULL), status (SMALLINT DEFAULT 1), created_at (TIMESTAMPTZ DEFAULT NOW()), updated_at (TIMESTAMPTZ), created_by (BIGINT referencing tblusers).
2. THE Payroll_Module SHALL create a `tblpayroll_cutoffs` table with columns: id (BIGSERIAL PRIMARY KEY), cutoff_start (DATE NOT NULL), cutoff_end (DATE NOT NULL), created_at (TIMESTAMPTZ DEFAULT NOW()), created_by (BIGINT referencing tblusers).
3. THE Payroll_Module SHALL create a `tblpayroll_records` table with columns: id (BIGSERIAL PRIMARY KEY), employee_id (BIGINT NOT NULL referencing tblpayroll_employees), cutoff_id (BIGINT NOT NULL referencing tblpayroll_cutoffs), base_salary_used (NUMERIC NOT NULL), payout_amount (NUMERIC NOT NULL), generated_at (TIMESTAMPTZ DEFAULT NOW()).
4. THE Payroll_Module SHALL enforce a unique constraint on (employee_id, cutoff_id) in the `tblpayroll_records` table to prevent duplicate payroll entries for the same employee and cutoff.

### Requirement 12: Frontend Routing and Navigation

**User Story:** As a user, I want the Payroll Module accessible from the sidebar navigation, so that I can navigate to it like other modules.

#### Acceptance Criteria

1. THE Payroll_Module SHALL register a route at `/payroll` in the Angular application routing configuration.
2. THE Payroll_Module SHALL appear in the sidebar navigation menu when the authenticated user has the `payroll` menu key in their allowed menus.
3. WHEN the user does not have the `payroll` menu key, THE sidebar navigation SHALL hide the Payroll Module link.
