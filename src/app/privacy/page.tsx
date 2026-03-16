// src/app/privacy/page.tsx
import React from "react";

export default function PrivacyPage() {
  return (
    <main className="bg-[var(--background)] text-[var(--foreground)] transition-colors">
      <section className="mx-auto max-w-4xl px-6 pt-8 pb-4">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm md:text-base text-[var(--muted)] max-w-prose">
          Effective date: October 20, 2025
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10 space-y-6">
        <h2 className="text-lg font-semibold">1. Introduction</h2>
        <p>
          This Privacy Policy explains how{" "}
          <strong>True Competency (“we”, “us”, “our”)</strong> collects, uses,
          discloses, and protects personal information when you access or use
          our competency-training platform and website (the “Service”). By using
          the Service, you consent to the collection and use of your information
          as described in this policy.
        </p>

        <h2 className="text-lg font-semibold">2. Information We Collect</h2>
        <p>We collect information in the following categories:</p>
        <ul className="list-disc list-inside">
          <li>
            <strong>Account & Profile Data:</strong> When you register for an
            account (e.g., email address, name, role, password credentials).
          </li>
          <li>
            <strong>Usage Data:</strong> Information on how you access and use
            the Service (e.g., timestamps, competency progress, answered
            questions, device/browser type).
          </li>
          <li>
            <strong>Automatically Collected Data:</strong> IP address, cookies,
            device identifiers, and analytics information.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">
          3. How We Use Your Information
        </h2>
        <p>We use your information for purposes including:</p>
        <ul className="list-disc list-inside">
          <li>Providing, operating, and improving the Service.</li>
          <li>
            Managing your account, verifying your identity, and authenticating
            access.
          </li>
          <li>
            Tracking your competency progress, generating reports, and enabling
            instructors/committee to review performance.
          </li>
          <li>Communicating updates, security alerts, support messages.</li>
          <li>Complying with legal obligations and protecting rights.</li>
        </ul>

        <h2 className="text-lg font-semibold">4. Data Sharing & Disclosure</h2>
        <p>
          We will not sell your personal information. We may share data in the
          following circumstances:
        </p>
        <ul className="list-disc list-inside">
          <li>
            With service providers who perform services on our behalf (e.g.,
            hosting, analytics). They are bound by confidentiality obligations.
          </li>
          <li>
            With instructors or committees where required to fulfill the Service
            (e.g., trainee progress reports).
          </li>
          <li>
            When required by law, or to respond to legal process, protect our
            rights, or prevent harm.
          </li>
        </ul>

        <h2 className="text-lg font-semibold">
          5. Cookies & Tracking Technologies
        </h2>
        <p>
          We use cookies and similar tracking technologies to personalise your
          experience, analyse usage, and support the Service. You can control
          cookies through your browser settings; however, disabling cookies may
          affect some features.
        </p>

        <h2 className="text-lg font-semibold">6. Data Security</h2>
        <p>
          We employ reasonable administrative, technical, and physical
          safeguards to protect your data, regularly reviewing our security
          practices and monitoring for vulnerabilities.
        </p>

        <h2 className="text-lg font-semibold">7. Data Retention</h2>
        <p>
          Your personal data is retained as long as your account is active or as
          needed to provide you the Service. We may retain information for
          longer if required by law or to resolve disputes.
        </p>

        <h2 className="text-lg font-semibold">8. Your Rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights such as accessing,
          correcting, deleting your data, or restricting processing. To exercise
          these rights, please contact us using the information below.
        </p>

        <h2 className="text-lg font-semibold">9. Children’s Privacy</h2>
        <p>
          Our Service is not directed to children under 13. We do not knowingly
          collect information from children under 13. If you believe we have
          inadvertently collected such information, please contact us so we can
          delete it.
        </p>

        <h2 className="text-lg font-semibold">10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. The “Effective
          date” at the top will reflect the most recent version. We recommend
          reviewing it periodically.
        </p>

        <h2 className="text-lg font-semibold">11. Contact Us</h2>
        <p>
          If you have questions or requests regarding your personal data, please
          contact us at:
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
