"use client"; // Mark as a Client Component

import {useEffect, useState} from "react";

// Define the expected structure of a diff object
interface DiffItem {
  id: string;
  description: string;
  diff: string;
  url: string; // Added URL field
}

// Define the expected structure of the API response
interface ApiResponse {
  diffs: DiffItem[];
  nextPage: number | null;
  currentPage: number;
  perPage: number;
}

interface DiffNote {
  diffId: string;
  marketingNotes: string | null;
  developerNotes: string | null;
  showMarketingNotes: boolean;
  showDeveloperNotes: boolean;
}

export default function Home() {
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [initialFetchDone, setInitialFetchDone] = useState<boolean>(false);
  const [activeNotes, setActiveNotes] = useState<Record<string, DiffNote>>({});

  const fetchDiffs = async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sample-diffs?page=${page}&per_page=10`
      );
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.details || errorMsg;
        } catch {
          // Ignore if response body is not JSON
          console.warn("Failed to parse error response as JSON");
        }
        throw new Error(errorMsg);
      }
      const data: ApiResponse = await response.json();

      setDiffs((prevDiffs) => {
        const existingIds = new Set(prevDiffs.map(d => d.id));
        const newUniqueDiffs = data.diffs.filter(d => !existingIds.has(d.id));
        return page === 1 ? data.diffs : [...prevDiffs, ...newUniqueDiffs];
      });

      setCurrentPage(data.currentPage);
      setNextPage(data.nextPage);
      if (!initialFetchDone) setInitialFetchDone(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchClick = () => {
    setDiffs([]); // Clear existing diffs when fetching the first page again
    fetchDiffs(1);
  };

  const handleLoadMoreClick = () => {
    if (nextPage) {
      fetchDiffs(nextPage);
    }
  };

  useEffect(() => {
    setActiveNotes(prevNotes => {
      let notesChanged = false;
      const newNotesToAdd: Record<string, DiffNote> = {};

      for (const diff of diffs) {
        if (!prevNotes[diff.id]) {
          newNotesToAdd[diff.id] = {
            diffId: diff.id,
            marketingNotes: null,
            developerNotes: null,
            showDeveloperNotes: true,
            showMarketingNotes: true,
          };
          notesChanged = true;
        }
      }

      return notesChanged ? { ...prevNotes, ...newNotesToAdd } : prevNotes;
    });
  }, [diffs]);


  const onDiffCreateClick = async (id: string, category: "Developer" | "Marketing") => {
    const typeToChange = category == "Marketing" ? "marketingNotes" : "developerNotes";
    setActiveNotes(prevNotes => {
      return {
        ...prevNotes,
        [id]: {
          ...prevNotes[id],
          [typeToChange]: "loading..."
        }
      };
    });
    const prompt = JSON.stringify({content: diffs.find(diff => diff.id === id)?.diff});
    const response = await fetch('/api/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({prompt: prompt, mode: category}),
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }
    console.log(response)

    const reader = response?.body?.getReader();
    const decoder = new TextDecoder();

    while(true) {
      // @ts-expect-error idek anymore
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);

      const messages = chunk.split('\n\n').filter(Boolean);

      for (const message of messages) {
        if (message.includes('data: ')) {
          const data = message.replace('data: ', '');

          if (data === '[DONE]') {
            setIsLoading(false);
            continue;
          }
          try {
            const parsedData = JSON.parse(data);

            if (parsedData.error) {
              setActiveNotes(prevNotes => {
                return {
                  ...prevNotes,
                  [id]: {
                    ...prevNotes[id],
                    [typeToChange]: "error while loading notes, please try again"
                  }
                };
              });
              continue;
            }
            console.log(parsedData)


            if (parsedData.content) {
              setActiveNotes(prevNotes => {
                return {
                  ...prevNotes,
                  [id]: {
                    ...prevNotes[id],
                    [typeToChange]: prevNotes[id][typeToChange] + parsedData.content
                  }
                };
              });
            }
          } catch (e) {
            console.error('Error parsing SSE message:', e);
          }
        }
      }
    }
  };

  useEffect(() => {

  }, [diffs]);

  const toggleNotes = (noteType: "Marketing" | "Developer", noteId: string) => {
    const typeToChange = noteType == "Marketing" ? "showMarketingNotes" : "showDeveloperNotes";
    setActiveNotes(prevNotes => {
      return {
        ...prevNotes,
        [noteId]: {
          ...prevNotes[noteId],
          [typeToChange]: !prevNotes[noteId][typeToChange]
        }
      };
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-12 sm:p-24">
      <h1 className="text-4xl font-bold mb-12">Diff Digest ✍️</h1>

      <div className="w-full max-w-4xl">
        {/* Controls Section */}
        <div className="mb-8 flex space-x-4">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            onClick={handleFetchClick}
            disabled={isLoading}
          >
            {isLoading && currentPage === 1
              ? "Fetching..."
              : "Fetch Latest Diffs"}
          </button>
        </div>

        {/* Results Section */}
        <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-6 min-h-[300px] bg-gray-50 dark:bg-gray-800">
          <h2 className="text-2xl font-semibold mb-4">Merged Pull Requests</h2>

          {error && (
            <div className="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 p-3 rounded mb-4">
              Error: {error}
            </div>
          )}

          {!initialFetchDone && !isLoading && (
            <p className="text-gray-600 dark:text-gray-400">
              Click the button above to fetch the latest merged pull requests
              from the repository.
            </p>
          )}

          {initialFetchDone && diffs.length === 0 && !isLoading && !error && (
            <p className="text-gray-600 dark:text-gray-400">
              No merged pull requests found or fetched.
            </p>
          )}

          {diffs.length > 0 && (
            <ul className="space-y-3 list-disc list-inside">
              {diffs.map((item) => (
                <li key={item.id} className="text-gray-800 dark:text-gray-200">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    PR #{item.id}:
                  </a>
                  <span className="ml-2">{item.description}</span>
                  <span className='ml-2 group underline relative text-blue-500 hover:text-blue-600'>
                    Create Diff Description
                    <div className='absolute text-sm text-center rounded m-6 min-w-60 group-hover:flex top-[-50px] w-full left-[-50px] hidden '>
                      <div onClick={() => {onDiffCreateClick(item.id, "Developer")}} className='cursor-pointer p-1 rounded-l hover:bg-gray-700 bg-gray-600 text-white'>
                        Developer Notes
                      </div>
                      <div onClick={() => {onDiffCreateClick(item.id, "Marketing")}} className='cursor-pointer p-1 rounded-r  hover:bg-blue-700 bg-blue-600 text-white'>
                        Marketing Notes
                      </div>
                    </div>
                  </span>


                  {activeNotes[item.id] && (activeNotes[item.id].marketingNotes || activeNotes[item.id].developerNotes) &&
                    <div className='mx-6 outline-gray-300 rounded outline flex flex-col gap-4 justify-start items-start p-2 pt-1'>
                      {activeNotes[item.id].developerNotes &&
                          <div className='flex w-full flex-col gap-2'>
                            <h3 className='border-b-1 w-full font-bold flex justify-start items-center gap-2 border-gray-300'>
                              Developer Notes
                              <svg onClick={() => toggleNotes("Developer", item.id)} className='h-4 cursor-pointer' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>
                            </h3>
                            {activeNotes[item.id].showDeveloperNotes &&
                                <ul className='list-decimal list-inside'>

                                  {      // @ts-expect-error not compiling otherwise?
                                    activeNotes[item.id].developerNotes != "loading..." ? activeNotes[item.id].developerNotes.split("///").map((point, index) => index != 0 && (
                                      <li className='mb-1' key={index}>
                                        {point}
                                      </li>
                                  )) : <p>loading...</p>
                                  }
                                </ul>
                            }
                          </div>
                      }
                      {activeNotes[item.id].marketingNotes &&
                          <div className='flex w-full flex-col gap-2'>
                            <h3 className='border-b-1 w-full font-bold flex justify-start items-center gap-2 border-gray-300'>
                              Marketing Notes
                              <svg onClick={() => toggleNotes("Marketing", item.id)} className='h-4 cursor-pointer' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>
                            </h3>
                            {activeNotes[item.id].showMarketingNotes &&
                            <ul className='list-decimal list-inside'>
                              {      // @ts-expect-error not compiling otherwise?
                                  activeNotes[item.id].marketingNotes != null && activeNotes[item.id].marketingNotes.split("///").map((point, index) => index != 0 && (
                                  <li className='mb-1' key={index}>
                                    {point}
                                  </li>
                              ))}
                            </ul>
                            }
                          </div>
                      }
                    </div>
                  }


                  {/* We won't display the full diff here, just the description */}
                </li>
              ))}
            </ul>
          )}

          {isLoading && currentPage > 1 && (
            <p className="text-gray-600 dark:text-gray-400 mt-4">
              Loading more...
            </p>
          )}

          {nextPage && !isLoading && (
            <div className="mt-6">
              <button
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
                onClick={handleLoadMoreClick}
                disabled={isLoading}
              >
                Load More (Page {nextPage})
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
