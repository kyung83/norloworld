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
  "https://script.google.com/macros/s/AKfycbwHdjbA6FEaz_ZVQcT1orzvHG1ASzilvxRX7ooiV7jUqp8b18S8_mL5Uszu9PO9vStw/exec";

export default function MainForm() {
  const [selectedDriver, setSelectedDriver] = useState({});
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedHomeTerminal, setHomeTerminal] = useState("");
  const [submittedBy, setSubmittedBy] = useState({});
  const [description, setDescription] = useState("");
  const [fileData, setFileData] = useState(null);
  const [warning, setWarning] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  // const [percentage, setPercentage] = useState(0)

  const [{ data, loading, error }] = useAxios(
    endPoint + "?route=getIncidentTypes"
  );
  const [
    { data: postData, loading: postLoading, error: postError },
    executePost,
  ] = useAxios(
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
    if (selectedDriver && selectedDriver.name) {  
      const selectedDriverData = data.drivers.find(driver => driver[0] === selectedDriver.name);
      if (selectedDriverData) {
        setHomeTerminal(selectedDriverData[1]);
      }
    }
  }, [selectedDriver]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (
      !selectedDriver ||
      !selectedIncident ||
      !submittedBy ||
      !description ||
      !selectedHomeTerminal
    ) {
      return setWarning(true);
    }

    const body = {
      driverName: selectedDriver.name,
      homeTerminal: selectedHomeTerminal,
      datetime: new Date().toISOString(),
      description: description,
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

  console.log(data)

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-12">
        <div className="border-b border-white/10">
        <ComboBox
        title="* Driver Name"
        items={data.drivers.map((driver, i) => ({ id: i, name: driver[0] }))}
        selectedPerson={selectedDriver}
        setSelectedPerson={setSelectedDriver}
      />
      <div className="flex flex-col">
        <label className="text-sm text-stone-500">
          * Home Terminal
        </label>
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
              items: typeone.items.map((item) => ({ id: item, name: item })),
            }))}
            selectedPerson={selectedIncident}
            setSelectedPerson={setSelectedIncident}
          />
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
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                defaultValue={""}
              />
            </div>
          </div>
          <ComboBox
            title="* Submitted by"
            items={data.users.map((name, i) => ({ id: i, name }))}
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
        className={`${
          !warning && "mt-4"
        } rounded-md bg-emerald-700 px-12 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500`}
      >
        Submit
      </button>
    </form>
  );
}
