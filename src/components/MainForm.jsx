import { useState, useEffect } from "react";
import useAxios from "axios-hooks";

import ComboBox from "./ComboBox";
import ComboBoxGroup from "./ComboBoxGroup";
import Spinner from "./Spinner";
// import ProgressBar from './ProgressBar'

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

const getTodayDate = () => {
  return new Date().toISOString().split("T")[0];
};

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

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function MainForm() {
  const [selectedDriver, setSelectedDriver] = useState({});
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedHomeTerminal, setHomeTerminal] = useState("");
  const [submittedBy, setSubmittedBy] = useState({});
  const [description, setDescription] = useState("");

  const [calledInDate, setCalledInDate] = useState(getTodayDate());
  const [calledInTime, setCalledInTime] = useState("");
  const [scheduledStartDate, setScheduledStartDate] = useState(getTodayDate());
  const [scheduledStartTime, setScheduledStartTime] = useState("");

  const [fileData, setFileData] = useState(null);
  const [warning, setWarning] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  // const [percentage, setPercentage] = useState(0)

  const isSubmittedByMissing = !submittedBy?.name;
  const isCallIn =
    selectedIncident?.name?.toLowerCase().replace(/\s+/g, "").includes("call-in") ||
    selectedIncident?.name?.toLowerCase().replace(/\s+/g, "").includes("callin");

  const callInDescription = `Driver called in on ${formatDateForDescription(
    calledInDate
  )} at ${
    calledInTime ? formatTimeForDescription(calledInTime) : "[time called in]"
  }. Driver was scheduled to start on ${formatDateForDescription(
    scheduledStartDate
  )} at ${
    scheduledStartTime
      ? formatTimeForDescription(scheduledStartTime)
      : "[scheduled start time]"
  }.`;

  const finalDescription = isCallIn ? callInDescription : description;

  const [{ data, loading, error }] = useAxios(
    endPoint + "?route=getIncidentTypes"
  );

  const [{ loading: postLoading, error: postError }, executePost] = useAxios(
    {
      url: endPoint + "?route=createIncident",
      method: "POST",
    },
    { manual: true }
  );

  const handleFileChange = async (event) => {
    const files = event.target.files;
    const allFileData = [];

    for (let i = 0; i < files.length; i++) {
      const myFile = files[i];

      if (myFile) {
        const contentBase64String = await readFileAsBase64(myFile);
        const contentType = myFile.type;
        const fileName = myFile.name;
        const file = { content: contentBase64String, contentType, fileName };
        allFileData.push(file);
      }
    }

    setFileData(allFileData);
  };

  useEffect(() => {
    if (selectedDriver && selectedDriver.name && data?.drivers) {
      const selectedDriverData = data.drivers.find(
        (driver) => driver[0] === selectedDriver.name
      );

      if (selectedDriverData) {
        setHomeTerminal(selectedDriverData[1]);
      }
    }
  }, [selectedDriver, data]);

  useEffect(() => {
    if (isCallIn) {
      setCalledInDate((currentValue) => currentValue || getTodayDate());
      setScheduledStartDate((currentValue) => currentValue || getTodayDate());
    }
  }, [isCallIn]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (
      !selectedDriver?.name ||
      !selectedIncident?.name ||
      isSubmittedByMissing ||
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
      file: fileData,
    };

    console.log(body);

    const response = await executePost({
      data: JSON.stringify(body),
    });

    if (response) {
      setDescription("");
      setHomeTerminal("");
      setFileData(null);
      setSubmittedBy({});
      setSelectedDriver({});
      setSelectedIncident(null);
      setCalledInDate(getTodayDate());
      setCalledInTime("");
      setScheduledStartDate(getTodayDate());
      setScheduledStartTime("");
      setSuccessMessage(true);
      setWarning(false);

      setTimeout(() => {
        setSuccessMessage(false);
      }, 4000);
    }
  }

  if (error || postError)
    return <h2 className="text-lg text-center p-4">Error</h2>;

  if (loading || postLoading) return <Spinner />;

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-12">
        <div className="border-b border-white/10">
          <ComboBox
            title="* Driver Name"
            items={data.drivers.map((driver, i) => ({
              id: i,
              name: driver[0],
            }))}
            selectedPerson={selectedDriver}
            setSelectedPerson={setSelectedDriver}
          />

          <div className="flex flex-col">
            <label className="text-sm text-stone-500">* Home Terminal</label>
            <input
              type="text"
              value={selectedHomeTerminal}
              onChange={(e) => setHomeTerminal(e.target.value)}
              className="p-2 rounded border shadow-sm"
            />
          </div>

          <ComboBoxGroup
            title="* Coaching Type"
            items={data.types.map((typeone) => ({
              ...typeone,
              items: typeone.items.map((item) => ({
                id: item,
                name: item,
              })),
            }))}
            selectedPerson={selectedIncident}
            setSelectedPerson={setSelectedIncident}
          />

          {isCallIn && (
            <div className="my-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-sm font-semibold text-emerald-900">
                Call-in Details
              </h3>

              <p className="mt-1 text-sm text-emerald-700">
                Fill in the times below. The description will be generated automatically.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="calledInDate"
                    className="block text-sm font-medium text-gray-900"
                  >
                    * Date driver called in
                  </label>
                  <input
                    type="date"
                    id="calledInDate"
                    value={calledInDate}
                    onChange={(e) => setCalledInDate(e.target.value)}
                    className="mt-2 block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                  />
                </div>

                <div>
                  <label
                    htmlFor="calledInTime"
                    className="block text-sm font-medium text-gray-900"
                  >
                    * Time driver called in
                  </label>
                  <input
                    type="time"
                    id="calledInTime"
                    value={calledInTime}
                    onChange={(e) => setCalledInTime(e.target.value)}
                    className="mt-2 block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                  />
                </div>

                <div>
                  <label
                    htmlFor="scheduledStartDate"
                    className="block text-sm font-medium text-gray-900"
                  >
                    * Date driver was scheduled to start
                  </label>
                  <input
                    type="date"
                    id="scheduledStartDate"
                    value={scheduledStartDate}
                    onChange={(e) => setScheduledStartDate(e.target.value)}
                    className="mt-2 block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                  />
                </div>

                <div>
                  <label
                    htmlFor="scheduledStartTime"
                    className="block text-sm font-medium text-gray-900"
                  >
                    * Time driver was scheduled to start
                  </label>
                  <input
                    type="time"
                    id="scheduledStartTime"
                    value={scheduledStartTime}
                    onChange={(e) => setScheduledStartTime(e.target.value)}
                    className="mt-2 block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label
              htmlFor="comment"
              className="block text-sm font-medium leading-6 text-gray-900"
            >
              * Description
            </label>

            <div className="mt-2">
              <textarea
                rows={4}
                name="comment"
                id="comment"
                onChange={(e) => setDescription(e.target.value)}
                value={isCallIn ? callInDescription : description}
                readOnly={isCallIn}
                className={`block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 sm:text-sm sm:leading-6 ${
                  isCallIn
                    ? "bg-gray-100 cursor-not-allowed"
                    : "focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                }`}
              />
            </div>
          </div>

          <ComboBox
            title="* Submitted by"
            items={data.users.map((name, i) => ({
              id: i,
              name,
            }))}
            selectedPerson={submittedBy}
            setSelectedPerson={setSubmittedBy}
          />

          <div className="my-4">
            <label
              htmlFor="file"
              className="block text-sm font-medium leading-6 text-gray-900"
            >
              Attachment upload
            </label>

            <div className="mt-2">
              <input
                type="file"
                id="inputfile"
                onChange={handleFileChange}
                multiple
                className="text-sm text-stone-500 file:mr-5 file:py-1 file:px-3 file:border-[1px] file:text-xs file:font-medium file:bg-stone-50 file:text-stone-700 hover:file:cursor-pointer hover:file:bg-blue-50 hover:file:text-blue-700"
              />
            </div>
          </div>

          {warning && (
            <p className="text-sm text-red-600 mt-4 mb-4" id="email-error">
              Complete the required fields *
            </p>
          )}

          {successMessage && (
            <div className="rounded-md bg-green-50 p-4 my-4" id="message">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">
                    Successfully uploaded
                  </p>
                </div>

                <div className="ml-auto pl-3">
                  <div className="-mx-1.5 -my-1.5">
                    <button
                      type="button"
                      className="inline-flex rounded-md bg-green-50 p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50"
                    >
                      <span className="sr-only">Dismiss</span>
                      <svg
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* <ProgressBar progress={percentage} /> */}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmittedByMissing}
        className={`${
          !warning && "mt-4"
        } rounded-md px-12 py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isSubmittedByMissing
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-emerald-700 text-white hover:bg-emerald-400 focus-visible:outline-emerald-500"
        }`}
      >
        Submit
      </button>
    </form>
  );
}
