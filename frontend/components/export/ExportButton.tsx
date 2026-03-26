// Export - ExportButton
import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ExportButtonProps {
  projectId: number;
  filters?: any;
}

const ExportButton: React.FC<ExportButtonProps> = ({ projectId, filters }) => {
  const handleExport = () => {
    // Export wiring TBD
    void projectId;
    void filters;
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleExport}>
      <Download className="w-4 h-4 mr-2" />
      Export
    </Button>
  );
};

export default ExportButton;
