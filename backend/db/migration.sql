-- Migration: Add new non-AI feature tables
-- Run after init.sql

-- ai_results table — JSONB store for all AI feature outputs (audit pattern)
CREATE TABLE IF NOT EXISTS ai_results (
  id SERIAL PRIMARY KEY,
  feature VARCHAR(100) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  prompt_summary TEXT,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  model VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_results_feature ON ai_results (feature);
CREATE INDEX IF NOT EXISTS idx_ai_results_user ON ai_results (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_results_entity ON ai_results (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_results_created ON ai_results (created_at DESC);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  department_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  head_radiologist_id INTEGER REFERENCES radiologists(id),
  location VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Referring physicians table
CREATE TABLE IF NOT EXISTS referring_physicians (
  id SERIAL PRIMARY KEY,
  physician_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  fax VARCHAR(20),
  specialty VARCHAR(255),
  institution VARCHAR(255),
  address TEXT,
  npi_number VARCHAR(20) UNIQUE,
  status VARCHAR(50) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  appointment_id VARCHAR(50) UNIQUE NOT NULL,
  patient_id INTEGER REFERENCES patients(id),
  radiologist_id INTEGER REFERENCES radiologists(id),
  referring_physician_id INTEGER REFERENCES referring_physicians(id),
  modality VARCHAR(50) NOT NULL,
  body_part VARCHAR(100),
  scheduled_date TIMESTAMP NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status VARCHAR(50) DEFAULT 'scheduled',
  priority VARCHAR(20) DEFAULT 'routine',
  room VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Billing table
CREATE TABLE IF NOT EXISTS billing (
  id SERIAL PRIMARY KEY,
  invoice_id VARCHAR(50) UNIQUE NOT NULL,
  patient_id INTEGER REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  report_id INTEGER REFERENCES reports(id),
  procedure_code VARCHAR(20),
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  insurance_billed DECIMAL(10,2) DEFAULT 0,
  insurance_paid DECIMAL(10,2) DEFAULT 0,
  patient_balance DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  billing_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_name VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  details TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  type VARCHAR(50) DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  entity_type VARCHAR(100),
  entity_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed Departments
INSERT INTO departments (department_id, name, description, location, phone, email, status) VALUES
('DEPT-001', 'Neuroradiology', 'Brain and spine imaging department', 'Building A, Floor 3', '555-2001', 'neuro@hospital.com', 'active'),
('DEPT-002', 'Musculoskeletal', 'Bone and joint imaging department', 'Building A, Floor 2', '555-2002', 'msk@hospital.com', 'active'),
('DEPT-003', 'Thoracic Imaging', 'Chest and lung imaging department', 'Building B, Floor 1', '555-2003', 'thoracic@hospital.com', 'active'),
('DEPT-004', 'Body Imaging', 'Abdominal and pelvic imaging', 'Building B, Floor 2', '555-2004', 'body@hospital.com', 'active'),
('DEPT-005', 'Breast Imaging Center', 'Mammography and breast MRI', 'Building C, Floor 1', '555-2005', 'breast@hospital.com', 'active'),
('DEPT-006', 'Interventional Radiology', 'Image-guided procedures', 'Building A, Floor 1', '555-2006', 'ir@hospital.com', 'active'),
('DEPT-007', 'Pediatric Imaging', 'Pediatric radiology department', 'Building D, Floor 1', '555-2007', 'peds@hospital.com', 'active'),
('DEPT-008', 'Nuclear Medicine', 'PET/CT and nuclear imaging', 'Building B, Floor 3', '555-2008', 'nuclear@hospital.com', 'active'),
('DEPT-009', 'Emergency Radiology', '24/7 emergency imaging services', 'ER Building, Floor 1', '555-2009', 'er-rad@hospital.com', 'active'),
('DEPT-010', 'Cardiac Imaging', 'Cardiac CT and MRI', 'Building C, Floor 2', '555-2010', 'cardiac@hospital.com', 'active')
ON CONFLICT (department_id) DO NOTHING;

-- Seed Referring Physicians
INSERT INTO referring_physicians (physician_id, name, email, phone, fax, specialty, institution, address, npi_number, status) VALUES
('REF-001', 'Dr. Alan Wright', 'alan.wright@clinic.com', '555-3001', '555-3101', 'Neurology', 'Boston Medical Group', '100 Main St, Boston, MA', '1234567890', 'active'),
('REF-002', 'Dr. Helen Torres', 'helen.torres@clinic.com', '555-3002', '555-3102', 'Internal Medicine', 'Cambridge Health Associates', '200 Harvard Ave, Cambridge, MA', '1234567891', 'active'),
('REF-003', 'Dr. Peter Adams', 'peter.adams@clinic.com', '555-3003', '555-3103', 'Pulmonology', 'Lung Care Specialists', '300 Beacon St, Boston, MA', '1234567892', 'active'),
('REF-004', 'Dr. Linda Scott', 'linda.scott@clinic.com', '555-3004', '555-3104', 'Family Medicine', 'Somerville Family Practice', '400 Elm St, Somerville, MA', '1234567893', 'active'),
('REF-005', 'Dr. Mark Stevens', 'mark.stevens@clinic.com', '555-3005', '555-3105', 'Urology', 'New England Urology', '500 Commonwealth Ave, Boston, MA', '1234567894', 'active'),
('REF-006', 'Dr. Susan Miller', 'susan.miller@clinic.com', '555-3006', '555-3106', 'Oncology', 'Mass Cancer Center', '600 Longwood Ave, Boston, MA', '1234567895', 'active'),
('REF-007', 'Dr. James Cooper', 'james.cooper@clinic.com', '555-3007', '555-3107', 'Orthopedics', 'Boston Orthopedic Group', '700 Boylston St, Boston, MA', '1234567896', 'active'),
('REF-008', 'Dr. Maria Fernandez', 'maria.fernandez@clinic.com', '555-3008', '555-3108', 'OB/GYN', 'Womens Health Associates', '800 Newbury St, Boston, MA', '1234567897', 'active'),
('REF-009', 'Dr. David Kim', 'david.kim@clinic.com', '555-3009', '555-3109', 'Cardiology', 'Heart Care Specialists', '900 Tremont St, Boston, MA', '1234567898', 'active'),
('REF-010', 'Dr. Rachel Green', 'rachel.green@clinic.com', '555-3010', '555-3110', 'Gastroenterology', 'GI Associates of Boston', '1000 Stuart St, Boston, MA', '1234567899', 'active'),
('REF-011', 'Dr. Thomas Lee', 'thomas.lee@clinic.com', '555-3011', '555-3111', 'Endocrinology', 'Thyroid and Diabetes Center', '1100 Brookline Ave, Boston, MA', '1234567800', 'active'),
('REF-012', 'Dr. Jennifer Walsh', 'jennifer.walsh@clinic.com', '555-3012', '555-3112', 'Rheumatology', 'Joint Care Center', '1200 Huntington Ave, Boston, MA', '1234567801', 'active')
ON CONFLICT (physician_id) DO NOTHING;

-- Seed Appointments
INSERT INTO appointments (appointment_id, patient_id, radiologist_id, referring_physician_id, modality, body_part, scheduled_date, duration_minutes, status, priority, room, notes) VALUES
('APT-001', 1, 1, 1, 'CT', 'Head', '2026-03-24 08:00:00', 30, 'scheduled', 'urgent', 'CT-1', 'Follow-up CT for headache evaluation'),
('APT-002', 2, 1, 2, 'MRI', 'Brain', '2026-03-24 09:00:00', 45, 'scheduled', 'routine', 'MRI-1', 'Annual MRI follow-up'),
('APT-003', 3, 3, 3, 'CT', 'Chest', '2026-03-24 10:30:00', 30, 'scheduled', 'stat', 'CT-2', 'STAT chest CT for acute SOB'),
('APT-004', 4, 10, 4, 'X-Ray', 'Chest', '2026-03-24 11:00:00', 15, 'checked_in', 'routine', 'XR-1', 'Pre-operative chest x-ray'),
('APT-005', 5, 4, 5, 'MRI', 'Abdomen', '2026-03-24 13:00:00', 60, 'scheduled', 'routine', 'MRI-2', 'Prostate MRI surveillance'),
('APT-006', 6, 5, 6, 'Ultrasound', 'Breast', '2026-03-24 14:00:00', 30, 'scheduled', 'routine', 'US-1', 'Diagnostic breast ultrasound'),
('APT-007', 7, 2, 7, 'MRI', 'Spine', '2026-03-24 15:00:00', 45, 'scheduled', 'routine', 'MRI-1', 'Lumbar spine MRI for back pain'),
('APT-008', 8, 7, 8, 'Ultrasound', 'Abdomen', '2026-03-25 08:30:00', 30, 'scheduled', 'routine', 'US-2', 'OB ultrasound 28 weeks'),
('APT-009', 9, 3, 3, 'CT', 'Chest', '2026-03-25 09:30:00', 30, 'scheduled', 'routine', 'CT-1', 'Lung nodule follow-up CT'),
('APT-010', 10, 1, 2, 'MRI', 'Brain', '2026-03-25 11:00:00', 60, 'scheduled', 'routine', 'MRI-2', 'MS follow-up MRI with contrast'),
('APT-011', 11, 4, 9, 'CT', 'Abdomen', '2026-03-25 13:00:00', 30, 'completed', 'urgent', 'CT-2', 'CTA aorta for aneurysm'),
('APT-012', 12, 2, 7, 'MRI', 'Knee', '2026-03-25 14:30:00', 45, 'completed', 'routine', 'MRI-1', 'Right knee MRI post ACL repair'),
('APT-013', 13, 4, 10, 'CT', 'Abdomen', '2026-03-23 08:00:00', 30, 'completed', 'stat', 'CT-1', 'Pancreatic mass evaluation'),
('APT-014', 14, 13, 11, 'Ultrasound', 'Neck', '2026-03-23 10:00:00', 30, 'completed', 'routine', 'US-1', 'Thyroid ultrasound follow-up'),
('APT-015', 1, 1, 1, 'CT', 'Head', '2026-03-26 08:00:00', 30, 'scheduled', 'routine', 'CT-1', 'Routine follow-up scan'),
('APT-016', 15, 12, 5, 'CT', 'Abdomen', '2026-03-23 14:00:00', 30, 'no_show', 'routine', 'CT-2', 'Kidney stone evaluation')
ON CONFLICT (appointment_id) DO NOTHING;

-- Seed Billing
INSERT INTO billing (invoice_id, patient_id, appointment_id, procedure_code, description, amount, insurance_billed, insurance_paid, patient_balance, status, billing_date, due_date, paid_date, notes) VALUES
('INV-001', 1, 1, '70450', 'CT Head without contrast', 1200.00, 1200.00, 960.00, 240.00, 'partial', '2026-03-24', '2026-04-23', NULL, 'Insurance covered 80%'),
('INV-002', 2, 2, '70553', 'MRI Brain with/without contrast', 2500.00, 2500.00, 2000.00, 500.00, 'partial', '2026-03-24', '2026-04-23', NULL, 'Awaiting patient payment'),
('INV-003', 3, 3, '71275', 'CT Chest Angiography (PE protocol)', 1800.00, 1800.00, 1800.00, 0.00, 'paid', '2026-03-24', '2026-04-23', '2026-03-24', 'Emergency - fully covered'),
('INV-004', 4, 4, '71046', 'Chest X-Ray PA and Lateral', 350.00, 350.00, 280.00, 70.00, 'pending', '2026-03-24', '2026-04-23', NULL, 'Pre-op standard coverage'),
('INV-005', 5, 5, '72197', 'MRI Abdomen with/without contrast', 3200.00, 3200.00, 2560.00, 640.00, 'pending', '2026-03-24', '2026-04-23', NULL, 'Medicare coverage'),
('INV-006', 6, 6, '76642', 'Breast Ultrasound', 450.00, 450.00, 360.00, 90.00, 'pending', '2026-03-24', '2026-04-23', NULL, 'Diagnostic - covered after deductible'),
('INV-007', 7, 7, '72148', 'MRI Lumbar Spine without contrast', 2200.00, 2200.00, 1760.00, 440.00, 'pending', '2026-03-24', '2026-04-23', NULL, 'Standard coverage 80%'),
('INV-008', 8, 8, '76805', 'OB Ultrasound complete', 550.00, 550.00, 550.00, 0.00, 'paid', '2026-03-25', '2026-04-24', '2026-03-25', 'Prenatal - fully covered'),
('INV-009', 11, 11, '74178', 'CT Abdomen/Pelvis with contrast', 1500.00, 1500.00, 1200.00, 300.00, 'partial', '2026-03-25', '2026-04-24', NULL, 'Urgent scan - standard coverage'),
('INV-010', 12, 12, '73721', 'MRI Knee without contrast', 1800.00, 1800.00, 1440.00, 360.00, 'paid', '2026-03-25', '2026-04-24', '2026-03-26', 'Sports injury - covered'),
('INV-011', 13, 13, '74177', 'CT Abdomen with contrast', 1400.00, 1400.00, 1120.00, 280.00, 'pending', '2026-03-23', '2026-04-22', NULL, 'Stat order'),
('INV-012', 14, 14, '76536', 'Thyroid Ultrasound', 400.00, 400.00, 320.00, 80.00, 'paid', '2026-03-23', '2026-04-22', '2026-03-23', 'Follow-up scan'),
('INV-013', 9, 9, '71260', 'CT Chest with contrast', 1300.00, 1300.00, 0.00, 1300.00, 'overdue', '2026-02-15', '2026-03-15', NULL, 'Insurance claim denied - patient responsible'),
('INV-014', 10, 10, '70553', 'MRI Brain with/without contrast', 2500.00, 2500.00, 2125.00, 375.00, 'pending', '2026-03-25', '2026-04-24', NULL, 'MS follow-up - specialty coverage')
ON CONFLICT (invoice_id) DO NOTHING;

-- Seed Notifications for admin user
INSERT INTO notifications (user_id, title, message, type, read, entity_type, entity_id) VALUES
(1, 'New STAT Appointment', 'STAT chest CT scheduled for Robert Chen', 'warning', false, 'appointment', 'APT-003'),
(1, 'Report Finalized', 'Report RPT-003 has been finalized by Dr. Rodriguez', 'success', true, 'report', 'RPT-003'),
(1, 'Overdue Invoice', 'Invoice INV-013 for William Martinez is overdue', 'error', false, 'billing', 'INV-013'),
(1, 'Patient No-Show', 'Christopher Lee did not show for appointment APT-016', 'warning', false, 'appointment', 'APT-016'),
(1, 'New Patient Registered', 'Nancy White has been added to the system', 'info', true, 'patient', 'PAT-016'),
(1, 'System Maintenance', 'PACS system maintenance scheduled for Sunday 2am-4am', 'info', false, NULL, NULL),
(2, 'New Assignment', 'You have been assigned to read CT Head for James Thompson', 'info', false, 'appointment', 'APT-001'),
(2, 'Report Review Required', 'AI-generated report for MRI Brain needs your review', 'warning', false, 'report', 'RPT-002');

-- Seed Audit Logs
INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details) VALUES
(1, 'Admin User', 'LOGIN', 'auth', NULL, 'Successful login'),
(1, 'Admin User', 'CREATE', 'patient', 'PAT-016', 'Created patient Nancy White'),
(1, 'Admin User', 'UPDATE', 'report', 'RPT-003', 'Finalized report'),
(2, 'Dr. Sarah Mitchell', 'LOGIN', 'auth', NULL, 'Successful login'),
(2, 'Dr. Sarah Mitchell', 'VIEW', 'image', 'IMG-002', 'Viewed MRI Brain image'),
(2, 'Dr. Sarah Mitchell', 'UPDATE', 'analysis', 'ANL-002', 'Reviewed AI analysis'),
(1, 'Admin User', 'CREATE', 'appointment', 'APT-001', 'Scheduled CT Head for James Thompson'),
(1, 'Admin User', 'CREATE', 'billing', 'INV-001', 'Created invoice for CT Head');
