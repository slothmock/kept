import { Download, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

function installed(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator
      && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export function InstallKeptCard() {
  const userAgent = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);

  return (
    <section className="space-y-3">
      <h2 className="text-h3 font-semibold tracking-tight">Install Kept</h2>
      <Card className="shadow-none">
        <CardContent className="flex items-start gap-3 p-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
            {installed() ? <Smartphone className="size-4" /> : <Download className="size-4" />}
          </div>
          <div className="space-y-2">
            <p className="text-label font-medium">
              {installed() ? "Kept is on your home screen" : "Add Kept to your home screen"}
            </p>
            <p className="text-caption text-muted-foreground">
              {installed()
                ? "You're using Kept in its installed app window."
                : isIos
                  ? "In Safari, tap Share, choose Add to Home Screen, then tap Add. Turn on Open as Web App if offered."
                  : isAndroid
                    ? "In Chrome, open the browser menu, choose Install app or Add to Home screen, then confirm."
                    : "On your phone, open Kept in Safari (iPhone) or Chrome (Android), then use the browser menu to add it to your home screen."}
            </p>
            <p className="text-caption text-muted-foreground">
              An internet connection is required for balances, savings and transactions.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
