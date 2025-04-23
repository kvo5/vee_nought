"use client";

import React, { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Copy, Download } from 'lucide-react'; // Added Download icon

const LaboratoryPage = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [latexTemplate, setLatexTemplate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLatex, setGeneratedLatex] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); // Re-added
  const [pdfFilename, setPdfFilename] = useState<string>(''); // Re-added
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl); // Clear previous results
    setPdfUrl(null);
    setPdfFilename('');
    setGeneratedLatex('');
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      toast.error("Please select a file first.");
      return;
    }

    setIsLoading(true);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl); // Clear previous results
    setPdfUrl(null);
    setPdfFilename('');
    setGeneratedLatex('');
    toast.info("Processing problem... this may take a moment.");

    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication error.");

      const formData = new FormData();
      formData.append('problemFile', selectedFile);
      if (latexTemplate.trim()) {
        formData.append('latexTemplate', latexTemplate);
      }

      const apiUrlBase = process.env.NEXT_PUBLIC_API_BASE_URL;
      const response = await axios.post(
        `${apiUrlBase}/laboratory/solve`,
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
          // Expect JSON response
        }
      );

      if (response.data && response.data.latex && response.data.pdfBase64) {
        setGeneratedLatex(response.data.latex);

        // Decode Base64 PDF and create object URL
        const pdfBytes = Uint8Array.from(atob(response.data.pdfBase64), c => c.charCodeAt(0));
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const newPdfUrl = URL.createObjectURL(pdfBlob);
        const downloadFilename = `${selectedFile?.name.split('.').slice(0, -1).join('.') || 'solution'}_solution.pdf`;

        setPdfUrl(newPdfUrl);
        setPdfFilename(downloadFilename);

        toast.success(response.data.message || "LaTeX solution generated and PDF compiled!");

      } else {
        console.error("Invalid response data:", response.data);
        throw new Error("Invalid response format from server (missing latex or pdfBase64).");
      }

    } catch (error: any) {
      console.error("Error processing problem:", error);
      let errorMessage = "An unexpected error occurred.";
       if (axios.isAxiosError(error) && error.response) {
         errorMessage = error.response.data?.message || `Server error: ${error.response.status}`;
       } else if (error instanceof Error) {
         errorMessage = error.message;
       }
      toast.error(`Processing failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (!generatedLatex) return;
    navigator.clipboard.writeText(generatedLatex)
      .then(() => toast.success("LaTeX copied to clipboard!"))
      .catch(err => {
          console.error("Failed to copy text: ", err);
          toast.error("Failed to copy LaTeX.");
      });
  };

  const handleDownloadLatex = () => {
    if (!generatedLatex) return;
    const blob = new Blob([generatedLatex], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Use original filename base for the .tex file name
    const texFilename = `${selectedFile?.name.split('.').slice(0, -1).join('.') || 'solution'}_solution.tex`;
    link.setAttribute('download', texFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("LaTeX file downloaded!");
  };


  // Cleanup object URL on component unmount or when pdfUrl changes
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);


  return (
    <div className="p-6 flex flex-col h-full">
      <h1 className="text-2xl font-bold mb-4">Laboratory</h1>
      <p className="mb-4 text-sm text-gray-400">Upload an image (PNG, JPG, WEBP) or PDF of a math problem to get a LaTeX solution compiled into a PDF.</p>

      <form onSubmit={handleSubmit} className="space-y-6 mb-6">
        {/* File Input */}
        <div>
          <label htmlFor="problem-file-input" className="block text-sm font-medium text-gray-300 mb-1">
            Problem File (Required)
          </label>
          <Input
            id="problem-file-input"
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp, image/heic, image/heif, application/pdf"
            onChange={handleFileChange}
            className="border-gray-600 bg-gray-700 text-white"
            disabled={isLoading}
          />
           {selectedFile && !isLoading && <p className="text-xs text-gray-400 mt-1">Selected: {selectedFile.name}</p>}
        </div>

        {/* LaTeX Template Input */}
        <div>
           <label htmlFor="latex-template-input" className="block text-sm font-medium text-gray-300 mb-1">
            Optional LaTeX Template (Advanced)
          </label>
          <Textarea
            id="latex-template-input"
            placeholder="Paste your LaTeX template here..."
            value={latexTemplate}
            onChange={(e) => setLatexTemplate(e.target.value)}
            className="border-gray-600 bg-gray-700 text-white min-h-[150px] font-mono text-sm"
            disabled={isLoading}
          />
           <p className="text-xs text-gray-400 mt-1">If provided, the AI will try to format the solution within this template.</p>
        </div>

        {/* Submit Button */}
        <Button type="submit" disabled={isLoading || !selectedFile}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isLoading ? 'Processing...' : 'Solve Problem & Generate PDF'}
        </Button>
      </form>

      {/* Results Section */}
      {(generatedLatex || pdfUrl) && (
         <div className="mt-8 pt-4 border-t border-gray-700 space-y-6 flex-grow flex flex-col overflow-hidden">

            {/* Generated LaTeX Display Section */}
            {generatedLatex && (
              <div className="shrink-0"> {/* Prevent textarea from growing excessively */}
                 <div className="flex justify-between items-center mb-2">
                   <h2 className="text-xl font-semibold">Generated LaTeX Solution</h2>
                   <Button onClick={handleCopyToClipboard} variant="outline" size="sm">
                     <Copy className="mr-2 h-4 w-4" /> Copy LaTeX
                   </Button>
                 </div>
                <Textarea
                  readOnly
                  value={generatedLatex}
                  className="border-gray-600 bg-gray-800 text-white min-h-[200px] max-h-[30vh] font-mono text-sm" // Added max-h
                />
              </div>
            )}

             {/* PDF Preview and Download Button Section */}
            {pdfUrl && (
              <div className="flex-grow flex flex-col overflow-hidden mt-4"> {/* Added mt-4 */}
                <h2 className="text-xl font-semibold mb-2 shrink-0">Compiled PDF Preview & Download</h2>
                 {/* Increased height */}
                <div className="mb-2 flex-grow overflow-hidden border border-gray-600" style={{ height: '70vh' }}>
                  <iframe
                    src={pdfUrl}
                    title="Compiled PDF"
                    width="100%"
                    height="100%"
                    style={{ border: 'none' }}
                  />
                </div>
                <div className="shrink-0 mt-2 flex space-x-2"> {/* Use flex for button layout */}
                    {/* Download PDF Button */}
                    <a
                      href={pdfUrl}
                      download={pdfFilename}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <Download className="mr-2 h-4 w-4" /> Download PDF ({pdfFilename})
                    </a>
                     {/* Download LaTeX Button */}
                    <Button onClick={handleDownloadLatex} variant="secondary" size="sm" className="text-xs">
                       <Download className="mr-2 h-4 w-4" /> Download .tex
                    </Button>
                </div>
              </div>
            )}
         </div>
      )}
    </div>
  );
};

export default LaboratoryPage;