import { App } from "@/app";
import { usePrivySession } from "@/auth/privy-session";

export function KeptApp() {
  const session = usePrivySession();
  return <App session={session} />;
}
