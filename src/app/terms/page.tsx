// src/app/terms/page.tsx
import React from "react";

export default function TermsPage() {
  return (
    <main className="bg-[var(--background)] text-[var(--foreground)] transition-colors">
      <section className="mx-auto max-w-4xl px-6 pt-8 pb-4">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm md:text-base text-[var(--muted)] max-w-prose">
          Effective date: October 20, 2025
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10 space-y-6">
        <h2 className="text-lg font-semibold">1. Acceptance of Terms</h2>
        <p>
          Welcome to <strong>True Competency</strong> (“we”, “us”, or “our”). By
          accessing or using our website, mobile application, or any related
          services (collectively, the “Service”), you agree to be bound by these
          Terms of Service (“Terms”). If you do not agree, please do not use the
          Service.
        </p>

        <h2 className="text-lg font-semibold">2. Description of Service</h2>
        <p>
          True Competency is a training and assessment platform designed for
          interventional cardiology education and professional competency
          development. The Service allows users (“you”, “users”, “trainees”,
          “instructors”, or “committee members”) to register, complete learning
          tasks, track progress, and interact with course materials and
          administrators.
        </p>

        <h2 className="text-lg font-semibold">3. Eligibility</h2>
        <p>
          You must be at least 16 years old to use the Service. By using the
          Service, you represent that you have the legal capacity to enter into
          these Terms and that the information you provide is accurate and
          complete.
        </p>

        <h2 className="text-lg font-semibold">4. Accounts and Security</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>
            You are responsible for maintaining the confidentiality of your
            account credentials.
          </li>
          <li>
            You agree to notify us immediately at{" "}
            <a
              href="mailto:support@truecompetency.com"
              className="text-[var(--accent)] underline"
            >
              support@truecompetency.com
            </a>{" "}
            if you suspect unauthorized access or account misuse.
          </li>
          <li>
            We reserve the right to suspend or terminate accounts that violate
            these Terms or our Privacy Policy.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">5. User Responsibilities</h2>
        <p>By using the Service, you agree not to:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Use the platform for unlawful, harmful, or misleading purposes.
          </li>
          <li>
            Share login credentials or access accounts that are not yours.
          </li>
          <li>
            Interfere with or disrupt the Service’s infrastructure or security.
          </li>
          <li>
            Upload malicious software or attempt to gain unauthorized access to
            any data.
          </li>
          <li>
            Copy, distribute, or reproduce platform materials without
            permission.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">6. Intellectual Property</h2>
        <p>
          All content, software, trademarks, and branding displayed on the
          Service are the property of True Competency or its licensors. You may
          not reproduce, modify, or create derivative works without express
          written permission.
        </p>

        <h2 className="text-lg font-semibold">
          7. Educational Content and Accuracy
        </h2>
        <p>
          The Service provides educational materials for informational purposes
          only. While we strive for accuracy and quality, True Competency does
          not guarantee that all content is complete, current, or free of
          errors.
        </p>

        <h2 className="text-lg font-semibold">8. Termination of Use</h2>
        <p>
          We may suspend or terminate your access to the Service at any time,
          without notice, if you violate these Terms, engage in misuse, or
          create risk to the platform or other users. Upon termination, your
          right to use the Service ceases immediately.
        </p>

        <h2 className="text-lg font-semibold">9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, True Competency and its
          affiliates shall not be liable for any indirect, incidental, special,
          or consequential damages arising out of your use of the Service. Our
          total liability for any claim shall not exceed the amount you paid (if
          any) for use of the Service in the 12 months preceding the event.
        </p>

        <h2 className="text-lg font-semibold">10. Disclaimer of Warranties</h2>
        <p>
          The Service is provided “as is” and “as available.” We disclaim all
          warranties, express or implied, including merchantability, fitness for
          a particular purpose, and non-infringement. We do not warrant that the
          Service will be uninterrupted or error-free.
        </p>

        <h2 className="text-lg font-semibold">11. Third-Party Links</h2>
        <p>
          The Service may contain links to third-party websites or services not
          owned or controlled by True Competency. We are not responsible for
          their content, policies, or practices, and access to them is at your
          own risk.
        </p>

        <h2 className="text-lg font-semibold">12. Changes to These Terms</h2>
        <p>
          We may modify these Terms at any time. Changes will be effective upon
          posting the updated Terms on this page with a new effective date.
          Continued use of the Service after such changes constitutes
          acceptance.
        </p>

        <h2 className="text-lg font-semibold">13. Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws
          of Quebec, Canada, without regard to conflict of law principles. Any
          disputes arising from these Terms shall be subject to the exclusive
          jurisdiction of the courts located in Montreal, Quebec.
        </p>

        <h2 className="text-lg font-semibold">14. Contact Information</h2>
        <p>
          For questions regarding these Terms, please contact us at:
          <br />
          <strong>True Competency</strong>
          <br />
          Email:{" "}
          <a
            href="mailto:contact@truecompetency.com"
            className="text-[var(--accent)] underline"
          >
            contact@truecompetency.com
          </a>
        </p>
      </section>
    </main>
  );
}
