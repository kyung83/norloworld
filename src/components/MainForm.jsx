import { useState, useEffect, useCallback } from "react";
import useAxios from "axios-hooks";
import axios from "axios";
import ComboBox from "./ComboBox";
import ComboBoxGroup from "./ComboBoxGroup";
import Spinner from "./Spinner";

const readFileAsBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = (error) => reject(error);
  });
};

const endPoint =
  "https://script.google.com/macros/s/AKfycbxDTKoWW2joDpaK075TH2yUY6FFvVIWByjsj_Yqfvfwai-n-B6IUfaWnaO5T_ImefId/exec";

// The dropdown data (drivers / users / coaching types) changes rarely, but the
// Google Apps Script backend can take 30-60s when it is queued behind the
// account's other scheduled scripts. So we keep our own copy in the browser and
// render the form from it instantly, then quietly refresh it in the background.
const LS_KEY = "norlo_coaching_dropdowns_v1";

const isUsablePayload = (d) =>
  !!d &&
  !d.error &&
  Array.isArray(d.drivers) &&
  Array.isArray(d.users) &&
  Array.isArray(d.types);

const loadCachedDropdowns = () => {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isUsablePayload(parsed) ? parsed : null;
  } catch (e) {
    return null; // private browsing, blocked storage, corrupt entry
  }
};

const saveCachedDropdowns = (d) => {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch (e) {
    /* storage full or blocked - not fatal, the form still works */
  }
};

const getTodayDate = () => new Date().toISOString().split("T")[0];

const formatDateForDescription = (dateValue) => {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-");
  return `${month}/${day}/${year}`;
};

const formatTimeForDescription = (timeValue) => {
  if (!timeValue) return "";
  const [hours, minutes] = timeValue.split(":");
  const date = new Date();
  date.setHours(Number(hours));
  date.setMinutes(Number(minutes));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function SectionLabel({ children }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-700">
      {children}
    </p>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        {required && <span className="mr-0.5 text-red-500">*</span>}
        {label}
      </label>
      {children}
    </div>
  );
}

export default function MainForm() {
  const [selectedDriver, setSelectedDriver] = useState({});
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedHomeTerminal, setHomeTerminal] = useState("");
  const [submittedBy, setSubmittedBy] = useState({});
  const [description, setDescription] = useState("");
  const [contactMethod, setContactMethod] = useState("");

  const [calledInDate, setCalledInDate] = useState(getTodayDate());
  const [calledInTime, setCalledInTime] = useState("");
  const [scheduledStartDate, setScheduledStartDate] = useState(getTodayDate());
  const [scheduledStartTime, setScheduledStartTime] = useState("");

  const [fileData, setFileData] = useState(null);
  const [warning, setWarning] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const isCallIn =
    selectedIncident?.name?.toLowerCase().replace(/\s+/g, "").includes("call-in") ||
    selectedIncident?.name?.toLowerCase().replace(/\s+/g, "").includes("callin");

  const callInDescription = `Driver called in on ${formatDateForDescription(calledInDate)} at ${
    calledInTime ? formatTimeForDescription(calledInTime) : "[time called in]"
  }. Driver was scheduled to start on ${formatDateForDescription(scheduledStartDate)} at ${
    scheduledStartTime ? formatTimeForDescription(scheduledStartTime) : "[scheduled start time]"
  }.`;

  const finalDescription = isCallIn ? callInDescription : description;

  const isSubmitDisabled =
    !submittedBy?.name || !contactMethod || !finalDescription;

  // Start from whatever the browser already has, so the form can render on the
  // first paint even while the network request is still in flight.
  const [cachedData, setCachedData] = useState(loadCachedDropdowns);

  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // Google intermittently answers this endpoint with an HTML page reading
  // "Sorry, unable to open the file at this time" — and sends it with an
  // HTTP 200, so it looks like success. It is a Drive-side hiccup, not a
  // real failure, and a retry a moment later almost always works. So we
  // attempt up to MAX_ATTEMPTS times before giving up, checking the SHAPE
  // of what came back rather than trusting the status code.
  const loadDropdowns = useCallback(async () => {
    const MAX_ATTEMPTS = 4;
    setLoading(true);
    setLoadFailed(false);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await axios.get(endPoint + "?route=getIncidentTypes", {
          timeout: 60000,
        });
        if (isUsablePayload(res?.data)) {
          setLiveData(res.data);
          saveCachedDropdowns(res.data);
          setCachedData(res.data);
          setLoading(false);
          return;
        }
        // Wrong shape: HTML error page, or an {error:...} body. Retry.
      } catch (e) {
        // Network error or timeout. Retry.
      }

      if (attempt < MAX_ATTEMPTS) {
        // Back off a little further each time: 1.5s, 3s, 4.5s.
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    setLoading(false);
    setLoadFailed(true);
  }, []);

  useEffect(() => {
    loadDropdowns();
  }, [loadDropdowns]);

  const refetchTypes = loadDropdowns;

  // Prefer the live response; fall back to the stored copy.
  const formData = liveData || cachedData;
  const usingCachedCopy = !liveData && !!cachedData;

  // Submitting. Separate timeout; a failure here must NOT wipe the form.
  const [{ loading: postLoading }, executePost] = useAxios(
    { url: endPoint + "?route=createIncident", method: "POST", timeout: 60000 },
    { manual: true }
  );

  const handleFileChange = async (event) => {
    const files = event.target.files;
    const allFileData = [];
    for (let i = 0; i < files.length; i++) {
      const myFile = files[i];
      if (myFile) {
        const contentBase64String = await readFileAsBase64(myFile);
        allFileData.push({
          content: contentBase64String,
          contentType: myFile.type,
          fileName: myFile.name,
        });
      }
    }
    setFileData(allFileData);
  };

  useEffect(() => {
    if (selectedDriver?.name && formData?.drivers) {
      const found = formData.drivers.find((d) => d[0] === selectedDriver.name);
      if (found) setHomeTerminal(found[1]);
    }
  }, [selectedDriver, formData]);

  useEffect(() => {
    if (isCallIn) {
      setCalledInDate((v) => v || getTodayDate());
      setScheduledStartDate((v) => v || getTodayDate());
    }
  }, [isCallIn]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    if (
      !selectedDriver?.name ||
      !selectedIncident?.name ||
      !submittedBy?.name ||
      !contactMethod ||
      !finalDescription ||
      !selectedHomeTerminal ||
      (isCallIn && (!calledInDate || !calledInTime || !scheduledStartDate || !scheduledStartTime))
    ) {
      return setWarning(true);
    }

    const body = {
      driverName: selectedDriver.name,
      homeTerminal: selectedHomeTerminal,
      datetime: new Date().toISOString(),
      description: finalDescription,
      incident: selectedIncident.name,
      submittedBy: submittedBy.name,
      contactMethod: contactMethod,
      file: fileData,
    };

    try {
      const response = await executePost({ data: JSON.stringify(body) });

      // The backend answers HTTP 200 even when it fails, so the real
      // status lives in the body. Check it before declaring success.
      const result = response?.data;
      if (result && (result.status === "error" || result.error)) {
        setSubmitError(
          result.message || result.error || "The server rejected the submission."
        );
        return;
      }

      setDescription("");
      setHomeTerminal("");
      setFileData(null);
      setSubmittedBy({});
      setSelectedDriver({});
      setSelectedIncident(null);
      setContactMethod("");
      setCalledInDate(getTodayDate());
      setCalledInTime("");
      setScheduledStartDate(getTodayDate());
      setScheduledStartTime("");
      setSuccessMessage(true);
      setWarning(false);
      setTimeout(() => setSuccessMessage(false), 4000);
    } catch (err) {
      // Network failure or timeout. Keep everything the user typed on
      // screen so they can simply press Submit again.
      setSubmitError(
        "Could not reach the server. Your entries are still here — press Submit to try again."
      );
    }
  }

  // ---- Load states -------------------------------------------------
  // The backend returns HTTP 200 with an {error:"..."} body when it fails,
  // so a bad payload has to be detected by shape, not by HTTP status.
  //
  // If we have a stored copy we show the form straight away and let the
  // refresh happen in the background. Only a first-ever visit with no
  // stored copy ever sees the spinner.
  if (!formData && loading) return <Spinner />;

  if (!formData) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">The form could not load its data.</p>
        <p className="mt-1 text-amber-800">
          Google&rsquo;s servers turned down several attempts in a row. This is a
          temporary problem on their end, not with anything you did. Press Try
          again — it usually works within a few seconds.
        </p>
        <button
          type="button"
          onClick={() => refetchTypes()}
          className="mt-4 rounded-lg bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Try again
        </button>
      </div>
    );
  }

  const inputClass =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">

      {/* Shown only when we are rendering from the stored copy while a
          refresh is still running, or when the refresh failed outright. */}
      {usingCachedCopy && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {loading ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
              Updating driver and user lists in the background — the form is ready to use.
            </>
          ) : (
            <>
              <span>Showing the last known driver and user lists. Could not reach the server to refresh them.</span>
              <button
                type="button"
                onClick={() => refetchTypes()}
                className="ml-auto shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                Refresh
              </button>
            </>
          )}
        </div>
      )}

      {/* Driver Info */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
        <SectionLabel>Driver Information</SectionLabel>
        <ComboBox
          title="Driver Name"
          required
          items={formData.drivers.map((driver, i) => ({ id: i, name: driver[0] }))}
          selectedPerson={selectedDriver}
          setSelectedPerson={setSelectedDriver}
        />
        <Field label="Home Terminal" required>
          <input
            type="text"
            value={selectedHomeTerminal}
            onChange={(e) => setHomeTerminal(e.target.value)}
            className={inputClass}
            placeholder="Auto-fills from driver selection"
          />
        </Field>
      </div>

      {/* Coaching Details */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
        <SectionLabel>Coaching Details</SectionLabel>
        <ComboBoxGroup
          title="Coaching Type"
          required
          items={formData.types.map((typeone) => ({
            ...typeone,
            items: (typeone.items || []).map((item) => ({ id: item, name: item })),
          }))}
          selectedPerson={selectedIncident}
          setSelectedPerson={setSelectedIncident}
        />

        {isCallIn && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="text-sm font-semibold text-emerald-900">Call-in Details</h3>
            <p className="mt-1 text-xs text-emerald-700">
              Fill in the times below — the description will be generated automatically.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Date driver called in" required>
                <input type="date" value={calledInDate} onChange={(e) => setCalledInDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Time driver called in" required>
                <input type="time" value={calledInTime} onChange={(e) => setCalledInTime(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Date driver was scheduled to start" required>
                <input type="date" value={scheduledStartDate} onChange={(e) => setScheduledStartDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Time driver was scheduled to start" required>
                <input type="time" value={scheduledStartTime} onChange={(e) => setScheduledStartTime(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </div>
        )}

        <Field label="Description" required>
          <textarea
            rows={4}
            onChange={(e) => setDescription(e.target.value)}
            value={isCallIn ? callInDescription : description}
            readOnly={isCallIn}
            placeholder={isCallIn ? "" : "Describe the coaching incident…"}
            className={`${inputClass} resize-none ${isCallIn ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""}`}
          />
        </Field>
      </div>

      {/* Submission Info */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
        <SectionLabel>Submission Info</SectionLabel>

        <ComboBox
          title="Submitted By"
          required
          items={formData.users.map((name, i) => ({ id: i, name }))}
          selectedPerson={submittedBy}
          setSelectedPerson={setSubmittedBy}
        />

        <Field label="Made contact with driver regarding this coaching by" required>
          <select
            value={contactMethod}
            onChange={(e) => setContactMethod(e.target.value)}
            className={inputClass}
          >
            <option value="">-- Select contact method --</option>
            <option value="Phone conversation">Phone conversation</option>
            <option value="ASR Message">ASR Message</option>
            <option value="In Person">In Person</option>
          </select>
        </Field>

        <Field label="Attachment (optional)">
          <input
            type="file"
            onChange={handleFileChange}
            multiple
            className="mt-1 block w-full text-sm text-slate-500
              file:mr-4 file:rounded-lg file:border file:border-slate-300
              file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium
              file:text-slate-700 hover:file:bg-emerald-50 hover:file:text-emerald-700
              hover:file:border-emerald-300 hover:file:cursor-pointer"
          />
        </Field>
      </div>

      {warning && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Please complete all required fields marked with *.
        </div>
      )}

      {submitError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{submitError}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <svg className="h-4 w-4 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          Coaching record submitted successfully!
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        {isSubmitDisabled && !postLoading && (
          <p className="text-xs text-slate-400 italic">
            Complete all required fields to enable the submit button.
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitDisabled || postLoading}
          className={`ml-auto rounded-lg px-8 py-2.5 text-sm font-semibold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            isSubmitDisabled || postLoading
              ? "cursor-not-allowed bg-slate-200 text-slate-400"
              : "bg-emerald-700 text-white hover:bg-emerald-600 focus-visible:outline-emerald-600"
          }`}
        >
          {postLoading ? "Submitting…" : "Submit Coaching Record"}
        </button>
      </div>
    </form>
  );
}
