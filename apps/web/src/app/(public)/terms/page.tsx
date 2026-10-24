import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & conditions"
      updated="24 October 2026"
      sections={[
        {
          heading: "About the service",
          body: [
            "MindEase Oasis offers an AI companion for emotional support, self-assessment tools, wellbeing resources, and access to independent, verified mental-health professionals.",
            "The AI companion is not a doctor. It does not diagnose, prescribe or provide emergency care. For emergencies, call 999 or go to the nearest hospital.",
          ],
        },
        {
          heading: "Your account",
          body: [
            "You must give accurate information and keep your password safe. You are responsible for activity on your account.",
            "We may suspend accounts that break these terms, misuse the service, or put others at risk.",
          ],
        },
        {
          heading: "Consultations",
          body: [
            "Doctors are independent professionals who are responsible for the advice they give. We verify their qualifications before listing them.",
            "Doctors may accept or decline booking requests. A declined request includes a reason.",
            "Online consultations take place as private text chats on the platform. In-person sessions happen at the location the doctor provides.",
          ],
        },
        {
          heading: "Payments",
          body: [
            "Prices are shown in BDT before you pay. You are never charged more than a doctor's listed consultation fee.",
            "If a payment fails, the booking is not created and no money is taken.",
            "Premium subscriptions renew monthly unless cancelled.",
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            "Treat doctors, staff and other users with respect. Harassment, abuse, or posting false reviews is not allowed.",
            "Do not try to access other people's data or interfere with the platform.",
          ],
        },
        {
          heading: "Changes",
          body: [
            "We may update these terms. We will let you know about significant changes before they take effect.",
          ],
        },
      ]}
    />
  );
}
