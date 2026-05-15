import type { ReactElement } from "react";
import { Loading } from "@/app/ui/loading";

export default function LoadingPage(): ReactElement {
  return <Loading label="Loading issue details..." />;
}
