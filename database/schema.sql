-- =====================================================================
-- ADVANCED EMPLOYEE PAYROLL MANAGEMENT SYSTEM
-- PostgreSQL Schema
-- =====================================================================

DROP TABLE IF EXISTS payslip_ledger CASCADE;
DROP TABLE IF EXISTS profile_update_requests CASCADE;
DROP TABLE IF EXISTS payslips CASCADE;
DROP TABLE IF EXISTS payroll CASCADE;
DROP TABLE IF EXISTS leaves CASCADE;
DROP TABLE IF EXISTS leave_balances CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ---------------------------------------------------------------------
-- ROLES
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    role_id     SERIAL PRIMARY KEY,
    role_name   VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (role_name) VALUES ('ADMIN'), ('EMPLOYEE');

-- ---------------------------------------------------------------------
-- USERS  (authentication)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    email         VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id       INTEGER NOT NULL REFERENCES roles(role_id),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- EMPLOYEES  (personal + banking details)
-- ---------------------------------------------------------------------
CREATE TABLE employees (
    employee_id       SERIAL PRIMARY KEY,
    user_id           INTEGER UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    employee_code     VARCHAR(20) UNIQUE NOT NULL,
    first_name        VARCHAR(80) NOT NULL,
    last_name         VARCHAR(80) NOT NULL,
    phone             VARCHAR(20),
    designation       VARCHAR(100),
    department        VARCHAR(100),
    date_of_joining   DATE NOT NULL,
    date_of_birth     DATE,
    address           TEXT,

    -- Banking details
    bank_name         VARCHAR(100),
    bank_account_no   VARCHAR(40),
    ifsc_code         VARCHAR(20),
    pan_number        VARCHAR(20),

    -- Salary structure
    base_pay          NUMERIC(12,2) NOT NULL DEFAULT 0,
    hra               NUMERIC(12,2) NOT NULL DEFAULT 0,
    conveyance_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    medical_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    pf_percentage     NUMERIC(5,2) NOT NULL DEFAULT 12.00,
    overtime_rate_per_hour NUMERIC(10,2) NOT NULL DEFAULT 0,

    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------
CREATE TABLE attendance (
    attendance_id   SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    work_date       DATE NOT NULL,
    clock_in        TIME,
    clock_out       TIME,
    total_hours     NUMERIC(5,2) DEFAULT 0,
    overtime_hours  NUMERIC(5,2) DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'PRESENT'
                    CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','ON_LEAVE','WEEK_OFF','HOLIDAY')),
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, work_date)
);

-- ---------------------------------------------------------------------
-- LEAVE BALANCES
-- ---------------------------------------------------------------------
CREATE TABLE leave_balances (
    leave_balance_id SERIAL PRIMARY KEY,
    employee_id      INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    leave_type       VARCHAR(30) NOT NULL CHECK (leave_type IN ('CASUAL','SICK','EARNED','UNPAID')),
    year             INTEGER NOT NULL,
    total_allotted   NUMERIC(5,1) NOT NULL DEFAULT 0,
    used             NUMERIC(5,1) NOT NULL DEFAULT 0,
    UNIQUE(employee_id, leave_type, year)
);

-- ---------------------------------------------------------------------
-- LEAVES (leave applications)
-- ---------------------------------------------------------------------
CREATE TABLE leaves (
    leave_id      SERIAL PRIMARY KEY,
    employee_id   INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    leave_type    VARCHAR(30) NOT NULL CHECK (leave_type IN ('CASUAL','SICK','EARNED','UNPAID')),
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    total_days    NUMERIC(5,1) NOT NULL,
    reason        TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    approved_by   INTEGER REFERENCES users(user_id),
    applied_at    TIMESTAMP DEFAULT NOW(),
    decided_at    TIMESTAMP
);

-- ---------------------------------------------------------------------
-- PAYROLL  (one row per employee per pay period)
-- ---------------------------------------------------------------------
CREATE TABLE payroll (
    payroll_id        SERIAL PRIMARY KEY,
    employee_id       INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    pay_period_month  INTEGER NOT NULL CHECK (pay_period_month BETWEEN 1 AND 12),
    pay_period_year   INTEGER NOT NULL,

    working_days      NUMERIC(5,1) NOT NULL DEFAULT 0,
    lop_days          NUMERIC(5,1) NOT NULL DEFAULT 0,
    overtime_hours    NUMERIC(6,2) NOT NULL DEFAULT 0,

    base_pay          NUMERIC(12,2) NOT NULL DEFAULT 0,
    hra               NUMERIC(12,2) NOT NULL DEFAULT 0,
    conveyance_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    medical_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    overtime_pay      NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,

    lop_deduction     NUMERIC(12,2) NOT NULL DEFAULT 0,
    pf_deduction      NUMERIC(12,2) NOT NULL DEFAULT 0,
    income_tax        NUMERIC(12,2) NOT NULL DEFAULT 0,
    professional_tax  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_deductions  NUMERIC(12,2) NOT NULL DEFAULT 0,

    net_salary        NUMERIC(12,2) NOT NULL DEFAULT 0,

    status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                       CHECK (status IN ('DRAFT','PROCESSED','EMAILED','PAID')),
    processed_at       TIMESTAMP,
    created_at         TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, pay_period_month, pay_period_year)
);

-- ---------------------------------------------------------------------
-- PAYSLIPS  (generated PDF metadata)
-- ---------------------------------------------------------------------
CREATE TABLE payslips (
    payslip_id     SERIAL PRIMARY KEY,
    payroll_id     INTEGER NOT NULL UNIQUE REFERENCES payroll(payroll_id) ON DELETE CASCADE,
    file_name      VARCHAR(255) NOT NULL,
    file_path      TEXT NOT NULL,
    emailed        BOOLEAN DEFAULT FALSE,
    emailed_at     TIMESTAMP,
    generated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE profile_update_requests (
    request_id                SERIAL PRIMARY KEY,
    employee_id               INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    requested_name            VARCHAR(100),
    requested_bank_name       VARCHAR(100),
    requested_account_number  VARCHAR(40),
    requested_ifsc_code       VARCHAR(20),
    requested_phone           VARCHAR(20),
    status                    VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    review_note               TEXT,
    reviewed_by               INTEGER REFERENCES users(user_id),
    requested_at              TIMESTAMP DEFAULT NOW(),
    reviewed_at               TIMESTAMP
);

CREATE TABLE payslip_ledger (
    ledger_id             SERIAL PRIMARY KEY,
    payslip_id            INTEGER NOT NULL UNIQUE REFERENCES payslips(payslip_id) ON DELETE CASCADE,
    employee_id           INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    generated_at          TIMESTAMP DEFAULT NOW(),
    verification_hash     VARCHAR(64) NOT NULL UNIQUE,
    company_name          VARCHAR(150) NOT NULL DEFAULT 'Payroll Management System'
);

CREATE INDEX idx_attendance_employee_date ON attendance(employee_id, work_date);
CREATE INDEX idx_leaves_employee_status ON leaves(employee_id, status);
CREATE INDEX idx_payroll_employee_period ON payroll(employee_id, pay_period_year, pay_period_month);

-- =====================================================================
-- MOCK DATA
-- Password for all mock users is: Password@123
-- (bcrypt hash generated with 10 salt rounds)
-- =====================================================================

INSERT INTO users (email, password_hash, role_id) VALUES
('admin@company.com', '$2b$10$MbUB.gB03MXESE6Yy5TXEuxh7m4pyYLNw9Tg2rPCIrMdYYjrQ8W4m', 1),
('john.doe@company.com', '$2b$10$MbUB.gB03MXESE6Yy5TXEuxh7m4pyYLNw9Tg2rPCIrMdYYjrQ8W4m', 2),
('jane.smith@company.com', '$2b$10$MbUB.gB03MXESE6Yy5TXEuxh7m4pyYLNw9Tg2rPCIrMdYYjrQ8W4m', 2),
('robert.brown@company.com', '$2b$10$MbUB.gB03MXESE6Yy5TXEuxh7m4pyYLNw9Tg2rPCIrMdYYjrQ8W4m', 2);

INSERT INTO employees (
    user_id, employee_code, first_name, last_name, phone, designation, department,
    date_of_joining, date_of_birth, address, bank_name, bank_account_no, ifsc_code, pan_number,
    base_pay, hra, conveyance_allowance, medical_allowance, special_allowance, pf_percentage, overtime_rate_per_hour
) VALUES
(2, 'EMP001', 'John', 'Doe', '+1-202-555-0101', 'Senior Software Engineer', 'Engineering',
 '2021-03-15', '1992-06-10', '221B Baker Street, Springfield',
 'First National Bank', '1234567890', 'FNB0001234', 'ABCDE1234F',
 60000, 15000, 3000, 2000, 5000, 12.00, 350),

(3, 'EMP002', 'Jane', 'Smith', '+1-202-555-0102', 'HR Manager', 'Human Resources',
 '2020-07-01', '1990-02-22', '742 Evergreen Terrace, Springfield',
 'Union Trust Bank', '2233445566', 'UTB0005678', 'FGHIJ5678K',
 55000, 13750, 2500, 2000, 4000, 12.00, 300),

(4, 'EMP003', 'Robert', 'Brown', '+1-202-555-0103', 'Financial Analyst', 'Finance',
 '2022-01-10', '1995-11-05', '10 Downing Street, Springfield',
 'Pacific Coast Bank', '3344556677', 'PCB0009876', 'KLMNO9012P',
 48000, 12000, 2000, 1500, 3000, 12.00, 275);

INSERT INTO leave_balances (employee_id, leave_type, year, total_allotted, used) VALUES
(1, 'CASUAL', 2026, 12, 2), (1, 'SICK', 2026, 10, 1), (1, 'EARNED', 2026, 15, 3),
(2, 'CASUAL', 2026, 12, 4), (2, 'SICK', 2026, 10, 0), (2, 'EARNED', 2026, 15, 5),
(3, 'CASUAL', 2026, 12, 1), (3, 'SICK', 2026, 10, 2), (3, 'EARNED', 2026, 15, 0);

INSERT INTO leaves (employee_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, decided_at) VALUES
(1, 'CASUAL', '2026-06-05', '2026-06-06', 2, 'Family function', 'APPROVED', 1, '2026-06-01'),
(2, 'SICK', '2026-06-10', '2026-06-10', 1, 'Fever', 'PENDING', NULL, NULL),
(3, 'UNPAID', '2026-06-15', '2026-06-16', 2, 'Personal work', 'PENDING', NULL, NULL);

-- Attendance mock data for June 2026 (partial sample, weekdays only for brevity)
INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, total_hours, overtime_hours, status) VALUES
(1, '2026-06-01', '09:00', '18:30', 9.5, 1.5, 'PRESENT'),
(1, '2026-06-02', '09:05', '18:00', 8.92, 0.92, 'PRESENT'),
(1, '2026-06-03', '09:00', '17:00', 8.0, 0.0, 'PRESENT'),
(1, '2026-06-04', NULL, NULL, 0, 0, 'ABSENT'),
(1, '2026-06-05', NULL, NULL, 0, 0, 'ON_LEAVE'),
(1, '2026-06-06', NULL, NULL, 0, 0, 'ON_LEAVE'),

(2, '2026-06-01', '09:15', '18:15', 9.0, 1.0, 'PRESENT'),
(2, '2026-06-02', '09:00', '17:30', 8.5, 0.5, 'PRESENT'),
(2, '2026-06-03', '09:00', '17:00', 8.0, 0.0, 'PRESENT'),
(2, '2026-06-04', '09:00', '17:00', 8.0, 0.0, 'PRESENT'),
(2, '2026-06-05', '09:00', '17:00', 8.0, 0.0, 'PRESENT'),

(3, '2026-06-01', '09:30', '18:00', 8.5, 0.5, 'PRESENT'),
(3, '2026-06-02', NULL, NULL, 0, 0, 'ABSENT'),
(3, '2026-06-03', '09:00', '17:00', 8.0, 0.0, 'PRESENT'),
(3, '2026-06-04', '09:00', '19:00', 10.0, 2.0, 'PRESENT'),
(3, '2026-06-05', '09:00', '17:00', 8.0, 0.0, 'PRESENT');
