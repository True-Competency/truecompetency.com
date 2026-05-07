<p align="center">
  <img src="public/TC_Logo.png" alt="True Competency" width="160" />
</p>

# True Competency

**Clinical competency training platform for interventional cardiology.**  
Built for the Asia Pacific Society of Cardiology (APSC) TCIP IVUS Course.

🌐 [truecompetency.com](https://www.truecompetency.com)

---

## What is True Competency?

True Competency is a structured, competency-based training platform designed for interventional cardiology education. It supports a full training workflow across three roles — trainees, instructors, and committee members — built around a curriculum of 114 clinical competencies assessed through case-based questions.

The platform is developed in partnership with the **Asia Pacific Society of Cardiology (APSC)** and the **Transcatheter Cardiovascular Imaging and Physiology (TCIP)** program, and is housed at the **Dobson Centre for Entrepreneurship at McGill University**.

---

## Key Features

### For Trainees
- Browse and enroll in competencies ordered by clinical curriculum position
- Answer case-based multiple choice questions with instant feedback
- Track progress across enrolled competencies with per-difficulty breakdowns
- View accuracy rates, activity history, and global leaderboard rankings

### For Instructors
- Monitor enrolled trainee progress in real time
- Assign competencies to trainees
- View detailed per-trainee completion stats

### For Committee Members
- Propose, review, and vote on new competencies and questions
- Manage tags and curriculum structure
- Chair committee can publish directly, reorder competencies, and manage members
- Full review queue with voting workflow

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Hosting | Vercel |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Email | Resend |
| Storage | Supabase Storage |

---

## Roles

| Role | Description |
|---|---|
| `trainee` | Enrolls in competencies, answers questions, tracks progress |
| `instructor` | Monitors and manages assigned trainees |
| `committee` / `editor` | Proposes and reviews competencies and questions |
| `committee` / `chief_editor` | Full chair privileges — publish, reorder, manage |
| `admin` | Platform administration |

---

## Contributing

This is a private platform under active development. Contributions are by invitation only.  
For questions or partnership inquiries, contact [contact@truecompetency.com](mailto:contact@truecompetency.com).

---

## Team

Built by **Murad Novruzov** in collaboration with  
**Marc James de Man** (Co-founder) and **Dr. Kwan Lee** (Co-founder, Chief Medical Officer).

---

## License

All rights reserved. © 2026 True Competency.  
This codebase is not open source. Unauthorized use, copying, or distribution is prohibited.
