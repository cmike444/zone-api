import { useState } from "react";
import { useStore, TIMEFRAMES, type AppSettings, type Timeframe } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export default function Settings() {
  const { settings, updateSettings } = useStore();
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isDirty = draft.defaultTimeframe !== settings.defaultTimeframe;

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-lg">
      <h1 className="text-base font-semibold text-foreground mb-1">Settings</h1>
      <p className="text-xs text-muted-foreground mb-6">
        Preferences are saved in your browser and persist across sessions.
      </p>

      <div className="space-y-6">
        <section className="border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">Chart</h2>

          <div>
            <label className="text-xs text-muted-foreground block mb-2">
              Default timeframe
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setDraft((d) => ({ ...d, defaultTimeframe: tf as Timeframe }))}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded font-medium border transition-colors",
                    draft.defaultTimeframe === tf
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-border/80",
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The chart timeframe that is selected when you open the dashboard.
            </p>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!isDirty && !saved}
            className={cn(
              "px-4 py-1.5 text-sm rounded font-medium transition-all",
              saved
                ? "bg-green-600/20 text-green-400 border border-green-600/30"
                : isDirty
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-default",
            )}
          >
            {saved ? (
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            ) : (
              "Save preferences"
            )}
          </button>

          {isDirty && (
            <button
              onClick={() => setDraft({ ...settings })}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
