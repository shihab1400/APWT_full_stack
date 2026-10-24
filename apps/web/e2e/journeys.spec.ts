import { expect, test, type Page } from "@playwright/test";

/**
 * Main user journeys from the test plan, run in a real browser against
 * production builds. Serial: later steps use the patient and booking made
 * by earlier ones. Accounts end in @e2e-pw.mindease.test and are removed
 * afterwards (global-teardown.ts).
 */
const stamp = Date.now();
const patient = {
  name: "PW Patient",
  email: `patient-${stamp}@e2e-pw.mindease.test`,
  password: "Passw0rd!",
};
const DOCTOR = { email: "sarah.ahmed@demo.mindease.local", password: "Doctor12345", name: "Dr. Sarah Ahmed" };
const ADMIN = { email: "admin@mindease.local", password: "Admin12345" };

async function logIn(page: Page, who: { email: string; password: string }, landing: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(landing);
}

/** Completes the built-in test checkout and waits for the result page. */
async function payOnTestCheckout(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/payments\/test-checkout\?ref=MEP-/);
  await page.getByRole("button", { name: /^Pay .* \(test\)$/ }).click();
  await expect(page.getByRole("heading", { name: "Payment successful" })).toBeVisible();
}

test.describe.serial("MindEase Oasis journeys", () => {
  test("a guest can browse doctors, articles and emergency help", async ({ page }) => {
    await page.goto("/");
    await page.goto("/doctors");
    await page.getByRole("link", { name: new RegExp(DOCTOR.name) }).first().click();
    await expect(page.getByRole("heading", { name: DOCTOR.name })).toBeVisible();
    // Guests see fees but must log in to book.
    await expect(page.getByText(/1,000 BDT/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in to book" })).toBeVisible();

    await page.goto("/emergency");
    await expect(page.getByText("999").first()).toBeVisible();
    await expect(page.getByText("01568978234").first()).toBeVisible();
  });

  test("protected pages send guests to log in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard|\/login\?next=\/dashboard/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a patient registers and a high-risk assessment recommends a doctor (FR_7)", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill(patient.name);
    await page.getByLabel("Email").fill(patient.email);
    await page.getByLabel("Password").fill(patient.password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // A patient can't open the admin area.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/dashboard/assessment");
    // The first card is the PHQ-9 mood check.
    await expect(page.getByRole("heading", { name: "Mood check (PHQ-9)" })).toBeVisible();
    await page.getByRole("link", { name: "Start" }).first().click();
    const answers = page.getByRole("radio", { name: "Nearly every day" });
    await expect(answers).toHaveCount(9);
    for (const radio of await answers.all()) await radio.check();
    await page.getByRole("button", { name: "See my results" }).click();

    await expect(page.getByText("27 / 27")).toBeVisible();
    await expect(page.getByText("High", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommended: speak with a doctor" })).toBeVisible();
    await expect(page.getByText("01568978234").first()).toBeVisible();
  });

  test("the patient upgrades to Premium and books a paid session (FR_8)", async ({ page }) => {
    await logIn(page, patient, /\/dashboard$/);

    await page.goto("/dashboard/billing");
    await page.getByRole("button", { name: /Upgrade for 499 BDT/ }).click();
    await payOnTestCheckout(page);
    await page.goto("/dashboard/billing");
    await expect(page.getByText("Premium", { exact: true })).toBeVisible();

    await page.goto("/doctors");
    await page.getByRole("link", { name: new RegExp(DOCTOR.name) }).first().click();
    await page.getByRole("link", { name: "See times and book" }).click();
    await expect(page.getByRole("heading", { name: `Book ${DOCTOR.name}` })).toBeVisible();
    await page.locator('label:has(input[name="slot"])').first().click();
    await page.getByLabel(/What would you like to talk about/).fill("Trouble sleeping before exams");
    await page.getByRole("button", { name: /^Pay 1,000 BDT and request$/ }).click();
    await payOnTestCheckout(page);

    await page.getByRole("link", { name: "My appointments" }).click();
    await expect(page.getByText("Awaiting doctor").first()).toBeVisible();
    await expect(page.getByText("Trouble sleeping before exams")).toBeVisible();
  });

  test("the doctor sees the request and confirms it (FR_11)", async ({ page }) => {
    await logIn(page, DOCTOR, /\/doctor$/);
    await page.goto("/doctor/appointments");
    const requests = page.getByRole("region", { name: "Booking requests" });
    await expect(requests.getByText(patient.name)).toBeVisible();
    await requests.getByRole("button", { name: "Confirm" }).first().click();
    await expect(page.getByRole("region", { name: "Upcoming" }).getByText(patient.name)).toBeVisible();
  });

  test("the patient sees the confirmation and a notification", async ({ page }) => {
    await logIn(page, patient, /\/dashboard$/);
    await page.goto("/dashboard/appointments");
    await expect(page.getByText("Confirmed").first()).toBeVisible();
    await page.getByRole("button", { name: /Notifications, \d+ unread/ }).click();
    await expect(page.getByText(`${DOCTOR.name} confirmed your appointment`)).toBeVisible();
  });

  test("an admin can find users, edit assessment logic and read the audit log (FR_2, FR_3, #24)", async ({ page }) => {
    await logIn(page, ADMIN, /\/admin$/);
    await page.getByLabel("Search by name or email").fill(patient.email);
    await expect(page.getByText(patient.email)).toBeVisible();

    await page.goto("/admin/assessments");
    await expect(page.getByLabel("High-risk threshold score")).toHaveValue("15");
    await expect(page.getByRole("button", { name: "Save logic" })).toBeVisible();

    await page.goto("/admin/payments");
    await expect(page.getByText(patient.email).first()).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  });
});
