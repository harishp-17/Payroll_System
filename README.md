# Advanced Employee Payroll Management System

A production-ready, full-stack payroll management system.

- **Frontend:** React.js + Tailwind CSS (Vite)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL

## Project Structure

```
payroll-system/
├── database/
│   └── schema.sql            # Full schema + mock data (3 employees)
├── backend/
│   ├── src/
│   │   ├── config/db.js      # PostgreSQL connection pool
│   │   ├── middleware/auth.js# JWT auth + RBAC
│   │   ├── utils/            # taxCalculator, pdfGenerator, mailer
│   │   ├── routes/           # auth, employees, attendance, leaves, payroll
│   │   └── app.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── api/axiosClient.js
    │   ├── context/AuthContext.jsx
    │   ├── components/
    │   │   ├── Login.jsx
    │   │   ├── admin/ (AdminDashboard, EmployeeLeaveManagement, PayrollProcessingHub)
    │   │   └── employee/ (EmployeeDashboard, EmployeeProfile, PayslipArchive)
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── tailwind.config.js
    ├── vite.config.js
    └── package.json
```

## 1. Database Setup

1. Create a PostgreSQL database:
   ```
   createdb payroll_db
   ```
2. Load the schema and mock data:
   ```
   psql -d payroll_db -f database/schema.sql
   ```

Mock login credentials (password for all accounts is `Password@123`):
- Admin: `admin@company.com`
- Employees: `john.doe@company.com`, `jane.smith@company.com`, `robert.brown@company.com`

> Note: Replace the bcrypt hash in `schema.sql` with a hash you generate locally
> (`node -e "console.log(require('bcrypt').hashSync('Password@123', 10))"`) if you want to guarantee
> the demo password matches exactly in your environment, since bcrypt hashes are salt-randomized.

## 2. Backend Setup

```
cd backend
npm install
cp .env.example .env
# edit .env with your PostgreSQL credentials, JWT secret, and SMTP credentials
npm run dev
```

The API runs at `http://localhost:5000`. Health check: `GET /api/health`.

### Key Endpoints
- `POST /api/auth/login`
- `GET /api/employees` (Admin)
- `GET /api/employees/:employeeId` (Self or Admin)
- `POST /api/attendance/clock-in` / `POST /api/attendance/clock-out`
- `GET /api/attendance/:employeeId?month&year`
- `POST /api/leaves/apply`
- `GET /api/leaves` (Admin)
- `PATCH /api/leaves/:leaveId/decision` (Admin, body: `{ decision: "APPROVED" | "REJECTED" }`)
- `POST /api/payroll/calculate/:employeeId` (Admin, body: `{ month, year }`)
- `GET /api/payroll/summary?month&year` (Admin)
- `POST /api/payroll/process-and-email/:employeeId` (Admin, body: `{ month, year }`)
- `GET /api/payroll/history/:employeeId`
- `GET /api/payroll/payslip/:payrollId/download`

## 3. Frontend Setup

```
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173` and proxies `/api` requests to `http://localhost:5000`.

## 4. Email Configuration

The payslip mailing service uses Nodemailer via SMTP. For Gmail, generate an
[App Password](https://support.google.com/accounts/answer/185833) and set `SMTP_USER` / `SMTP_PASSWORD`
in `backend/.env`. Any standard SMTP provider (SendGrid, Mailgun, SES, Outlook) also works — just update
`SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` accordingly.

## 5. Payroll Calculation Logic

Implemented in `backend/src/utils/taxCalculator.js` and orchestrated in `backend/src/routes/payroll.routes.js`:

1. **Base Pay & Allowances** — fetched directly from the `employees` table (HRA, conveyance, medical, special allowance).
2. **Overtime Pay** — sum of `overtime_hours` from `attendance` for the period × employee's `overtime_rate_per_hour`.
3. **Loss of Pay (LOP)** — absent days (from `attendance`) plus unpaid/rejected leave days (from `leaves`), pro-rated against gross salary over standard working days.
4. **Provident Fund (PF)** — percentage of base pay (`pf_percentage`, default 12%).
5. **Income Tax** — progressive slab-based calculation on annualized gross salary, converted back to a monthly deduction.
6. **Net Salary** — Gross Salary − (LOP + PF + Income Tax + Professional Tax).

## 6. Payslip Generation & Emailing Flow

When an Admin clicks **"Process & Email Payslip"** in the Payroll Processing Hub:
1. The backend recalculates the payroll breakdown for that employee/period.
2. The record is upserted into the `payroll` table with status `PROCESSED`.
3. `pdfGenerator.js` (using `pdfkit`) renders a professional PDF payslip to `storage/payslips/`.
4. `mailer.js` (using `nodemailer`) emails the PDF as an attachment to the employee's registered email.
5. The `payslips` table records the file location and email status; `payroll.status` becomes `EMAILED`.

Employees can view and re-download any previously generated payslip from their **Payslip Archive** tab.
