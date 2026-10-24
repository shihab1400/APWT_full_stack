import { Suspense } from "react";
import { TakeAssessment } from "./take-assessment";

export default function TakeAssessmentPage() {
  return (
    <Suspense>
      <TakeAssessment />
    </Suspense>
  );
}
