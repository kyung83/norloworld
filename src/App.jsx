import { MainForm } from "./components";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
          <img
            className="h-14 w-auto"
            src="https://www.norloworld.com/static/mainimages/northern-logistics-logo.png"
            alt="Northern Logistics"
          />

          <div className="ml-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Northern Logistics
            </p>
            <h1 className="text-xl font-bold text-slate-900">
              Coaching Submission Form
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Coaching
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Complete the required fields below, then submit the coaching record.
          </p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <MainForm />
        </section>
      </main>
    </div>
  );
}
