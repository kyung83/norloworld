import { useState, useEffect } from "react";
import useAxios from "axios-hooks";
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

  // Loading the dropdown data. 60s timeout so a stalled request gives up
  // and shows a Retry button instead of spinning forever.
  const [{ data, loading, error }, refetchTypes] = useAxios({
    url: endPoint + "?route=getIncidentTypes",
    method: "GET",
    timeout: 60000,
  });

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
    if (selectedDriver?.name && data?.drivers) {
      const found = data.drivers.find((d) => d[0] === selectedDriver.name);
      if (found) setHomeTerminal(found[1]);
    }
  }, [selectedDriver, data]);

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
  // The backend returns HTTP 200 with an {error:"..."} body when it
  // fails, so a bad payload has to be detected by shape, not by status.
  // Previously the code went straight to data.drivers.map(...) which
  // threw a TypeError and blanked the whole page.
  const payloadBad =
    !loading &&
    !error &&
    (!data ||
      data.error ||
      !Array.isArray(data.drivers) ||
      !Array.isArray(data.users) ||
      !Array.isArray(data.types));

  if (loading) return <Spinner />;

  if (error || payloadBad) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">The form could not load its data.</p>
        <p className="mt-1 text-amber-800">
          This is usually the Google Sheets backend being slow or busy. Nothing
          you submitted has been lost.
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

      {/* Driver Info */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
        <SectionLabel>Driver Information</SectionLabel>
        <ComboBox
          title="Driver Name"
          required
          items={data.drivers.map((driver, i) => ({ id: i, name: driver[0] }))}
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
          items={data.types.map((typeone) => ({
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
          items={data.users.map((name, i) => ({ id: i, name }))}
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
