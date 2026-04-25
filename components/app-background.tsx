/**
 * Fixed-position atmospheric background for every nao.fyi route.
 * Layered gradient + 3 blurred orbs give glass surfaces something to refract.
 * Pointer-events-none and -z-10 so it never intercepts clicks.
 */
export function AppBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        background:
          "linear-gradient(140deg, var(--bg-from) 0%, var(--bg-via) 50%, var(--bg-to) 100%)",
      }}
    >
      <div
        className="absolute -top-32 -left-24 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: "var(--orb-1)" }}
      />
      <div
        className="absolute top-1/3 -right-32 h-[460px] w-[460px] rounded-full blur-3xl"
        style={{ background: "var(--orb-2)" }}
      />
      <div
        className="absolute -bottom-40 left-1/3 h-[560px] w-[560px] rounded-full blur-3xl"
        style={{ background: "var(--orb-3)" }}
      />
    </div>
  );
}
