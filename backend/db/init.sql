-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS prior_studies CASCADE;
DROP TABLE IF EXISTS ai_analyses CASCADE;
DROP TABLE IF EXISTS radiology_images CASCADE;
DROP TABLE IF EXISTS radiologists CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'radiologist',
  created_at TIMESTAMP DEFAULT NOW()
);

-- patients table
CREATE TABLE patients (
  id SERIAL PRIMARY KEY,
  patient_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(20) NOT NULL,
  medical_record_number VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  insurance_provider VARCHAR(255),
  insurance_id VARCHAR(100),
  allergies TEXT,
  medical_history TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- radiologists table
CREATE TABLE radiologists (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  specialization VARCHAR(255) NOT NULL,
  license_number VARCHAR(100) UNIQUE NOT NULL,
  years_experience INTEGER NOT NULL,
  phone VARCHAR(20),
  department VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  certifications TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- radiology_images table
CREATE TABLE radiology_images (
  id SERIAL PRIMARY KEY,
  image_id VARCHAR(50) UNIQUE NOT NULL,
  patient_id INTEGER REFERENCES patients(id),
  modality VARCHAR(50) NOT NULL,
  body_part VARCHAR(100) NOT NULL,
  description TEXT,
  acquisition_date TIMESTAMP NOT NULL,
  dicom_status VARCHAR(50) DEFAULT 'stored',
  de_identified BOOLEAN DEFAULT false,
  pacs_location VARCHAR(255),
  file_size VARCHAR(50),
  referring_physician VARCHAR(255),
  clinical_indication TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ai_analyses table
CREATE TABLE ai_analyses (
  id SERIAL PRIMARY KEY,
  analysis_id VARCHAR(50) UNIQUE NOT NULL,
  image_id INTEGER REFERENCES radiology_images(id),
  analysis_type VARCHAR(100) NOT NULL,
  findings TEXT,
  confidence_score DECIMAL(5,2),
  areas_of_interest JSONB,
  ai_model VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES radiologists(id),
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- prior_studies table
CREATE TABLE prior_studies (
  id SERIAL PRIMARY KEY,
  study_id VARCHAR(50) UNIQUE NOT NULL,
  patient_id INTEGER REFERENCES patients(id),
  modality VARCHAR(50) NOT NULL,
  body_part VARCHAR(100) NOT NULL,
  study_date DATE NOT NULL,
  diagnosis VARCHAR(500),
  findings TEXT,
  radiologist_name VARCHAR(255),
  institution VARCHAR(255),
  similarity_tags TEXT[],
  study_notes TEXT,
  outcome VARCHAR(255),
  follow_up_required BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- reports table
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  report_id VARCHAR(50) UNIQUE NOT NULL,
  image_id INTEGER REFERENCES radiology_images(id),
  patient_id INTEGER REFERENCES patients(id),
  radiologist_id INTEGER REFERENCES radiologists(id),
  report_type VARCHAR(100) NOT NULL,
  clinical_history TEXT,
  technique TEXT,
  findings TEXT,
  impression TEXT,
  recommendations TEXT,
  ai_draft TEXT,
  final_report TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  compliance_check BOOLEAN DEFAULT false,
  signed_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
