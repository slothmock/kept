import { App } from "@/app/App";
import { usePrivySession } from "@/app/providers/privy-session";

export function KeptApp() {
  const session = usePrivySession();
  return <App session={session} />;
}
