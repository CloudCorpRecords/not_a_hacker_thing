import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  FileCheck2,
  FileImage,
  HardHat,
  Image as ImageIcon,
  LocateFixed,
  MapPinned,
  Route,
  Ruler,
  ShieldCheck,
  Truck,
  Waves,
  Wrench,
} from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Drawings",
    detail: "Plan + permits",
    phase: "PLAN",
    icon: Ruler,
    tone: "#D7E7E1",
    ink: "#1B5149",
  },
  {
    number: "02",
    title: "Utility Locates",
    detail: "Mark what is underground",
    phase: "PLAN",
    icon: LocateFixed,
    tone: "#D7E7E1",
    ink: "#1B5149",
  },
  {
    number: "03",
    title: "Hydrovac",
    detail: "Safely expose crossings",
    phase: "BUILD",
    icon: Waves,
    tone: "#F3E1B5",
    ink: "#81591A",
  },
  {
    number: "04",
    title: "Trenching",
    detail: "Open the route",
    phase: "BUILD",
    icon: Route,
    tone: "#F3E1B5",
    ink: "#81591A",
  },
  {
    number: "05",
    title: "Conduit Placement",
    detail: "Install protective pipe",
    phase: "BUILD",
    icon: Wrench,
    tone: "#F3E1B5",
    ink: "#81591A",
  },
  {
    number: "06",
    title: "Fiber Jetting",
    detail: "Pull / blow cable",
    phase: "CONNECT",
    icon: Truck,
    tone: "#F4D2C3",
    ink: "#9A4934",
  },
  {
    number: "07",
    title: "Splicing & Testing",
    detail: "Connect and verify",
    phase: "CONNECT",
    icon: ShieldCheck,
    tone: "#F4D2C3",
    ink: "#9A4934",
  },
  {
    number: "08",
    title: "Restoration & Sign-off",
    detail: "Repair and close",
    phase: "CLOSE",
    icon: Check,
    tone: "#E0D9E9",
    ink: "#5C4375",
  },
];

const phases = [
  { label: "01–02", name: "PLAN", color: "#1B5149", width: "25%" },
  { label: "03–05", name: "BUILD", color: "#81591A", width: "37.5%" },
  { label: "06–07", name: "CONNECT", color: "#9A4934", width: "25%" },
  { label: "08", name: "CLOSE", color: "#5C4375", width: "12.5%" },
];

function StepCard({
  step,
  index,
}: {
  step: (typeof steps)[number];
  index: number;
}) {
  const Icon = step.icon;
  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="font-mono text-[11px] font-bold tracking-[0.18em]"
          style={{ color: step.ink }}
        >
          {step.number}
        </span>
        {index < steps.length - 1 && (
          <span className="h-px flex-1 bg-[#D9D5C9]" aria-hidden="true" />
        )}
      </div>
      <div
        className="flex min-h-[142px] flex-col justify-between rounded-[3px] border border-[#D6D1C5] p-3.5 shadow-[0_2px_0_rgba(35,48,42,0.06)]"
        style={{ backgroundColor: "#F9F7F0" }}
      >
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[2px]"
            style={{ backgroundColor: step.tone, color: step.ink }}
          >
            <Icon size={17} strokeWidth={1.8} />
          </div>
          <span
            className="font-mono text-[8px] font-bold tracking-[0.16em]"
            style={{ color: step.ink }}
          >
            {step.phase}
          </span>
        </div>
        <div>
          <h3 className="mt-3 text-[14px] font-bold leading-[1.05] tracking-[-0.02em] text-[#26362F]">
            {step.title}
          </h3>
          <p className="mt-1.5 text-[10px] leading-[1.2] text-[#6D756D]">
            {step.detail}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SystematicOverview() {
  return (
    <main
      className="relative flex aspect-[16/9] min-h-[100dvh] w-full flex-col overflow-hidden bg-[#E7E4D9] text-[#26362F]"
      style={{
        fontFamily:
          "'Avenir Next', 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="pointer-events-none absolute -right-24 -top-28 h-[360px] w-[360px] rounded-full border-[42px] border-[#D9DED2] opacity-60" />
      <div className="pointer-events-none absolute bottom-[-150px] left-[-80px] h-[300px] w-[300px] rounded-full border-[34px] border-[#D9DED2] opacity-40" />

      <header className="relative z-10 flex items-start justify-between px-[5.5%] pb-5 pt-[4.5%]">
        <div className="max-w-[920px]">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C47E37]" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#8B6844]">
              Operating standard / field to office
            </span>
          </div>
          <h1 className="text-[clamp(30px,3.8vw,58px)] font-black leading-[0.94] tracking-[-0.055em] text-[#26362F]">
            One route. Eight steps.
            <br />
            <span className="text-[#A04D36]">One shared record.</span>
          </h1>
          <p className="mt-4 max-w-[700px] text-[clamp(12px,1.15vw,17px)] leading-[1.35] text-[#58655C]">
            Every fiber project follows the same handoff rhythm — so crews know
            what comes next and the office always knows what is true.
          </p>
        </div>
        <div className="mt-1 hidden w-[190px] shrink-0 border-l-2 border-[#C47E37] pl-4 sm:block">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.19em] text-[#8B6844]">
            Project control
          </div>
          <div className="mt-2 text-[13px] font-bold leading-[1.25] text-[#26362F]">
            Repeatable work.
            <br />
            Visible progress.
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-[5.5%] flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-mono text-[9px] font-bold tracking-[0.19em] text-[#7B827B]">
            THE LIFECYCLE
          </span>
          <span className="h-px flex-1 bg-[#C9C9BD]" />
          <span className="font-mono text-[9px] tracking-[0.12em] text-[#8B9188]">
            START → COMPLETE
          </span>
        </div>
        <div className="mb-5 flex gap-1">
          {phases.map((phase) => (
            <div
              key={phase.name}
              className="flex h-6 items-center gap-2 border-l-2 pl-2"
              style={{ borderColor: phase.color, width: phase.width }}
            >
              <span className="font-mono text-[8px] text-[#8B9188]">{phase.label}</span>
              <span
                className="text-[9px] font-black tracking-[0.13em]"
                style={{ color: phase.color }}
              >
                {phase.name}
              </span>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 gap-2">
          {steps.map((step, index) => (
            <StepCard key={step.number} step={step} index={index} />
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-[5.5%] mb-[4.5%] mt-6 grid grid-cols-[1.15fr_1fr] gap-5 rounded-[4px] border border-[#C9C9BD] bg-[#DCE0D5] p-4 sm:p-5">
        <div className="flex items-center gap-4 border-r border-[#BFC7BA] pr-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] bg-[#1B5149] text-[#F3E8C9]">
            <ClipboardList size={20} strokeWidth={1.8} />
          </div>
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[0.17em] text-[#1B5149]">
              THE SAME PROOF AT EVERY HANDOFF
            </div>
            <p className="mt-1 text-[11px] leading-[1.25] text-[#526057]">
              No “done” without a record the next person can trust.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-2">
          {[
            { icon: HardHat, label: "OWNER" },
            { icon: FileCheck2, label: "STATUS" },
            { icon: CalendarDays, label: "DATE" },
            { icon: ImageIcon, label: "EVIDENCE / PHOTO" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <Icon size={15} className="shrink-0 text-[#A04D36]" strokeWidth={1.8} />
              <span className="font-mono text-[8px] font-bold leading-[1.1] tracking-[0.08em] text-[#59655C]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <footer className="absolute bottom-3 right-[5.5%] z-10 flex items-center gap-2 font-mono text-[8px] tracking-[0.16em] text-[#899087]">
        <MapPinned size={11} />
        SOURCE OF TRUTH / FIELD + OFFICE
      </footer>
    </main>
  );
}