// Layout - CanvasPageLayout
import React from 'react';

interface CanvasPageLayoutProps {
    children: React.ReactNode;
    orgId?: string;
    projectId?: number;
    projectName?: string;
    orgName?: string;
    activeTab?: string;
    showCopyButton?: boolean;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onFitView?: () => void;
    onClearCanvas?: () => void;
    onResetCanvas?: () => void;
    onCopyAllToTestLab?: () => void;
    copyAllDisabled?: boolean;
    rightPanel?: React.ReactNode;
    onUndo?: () => void;
    onRedo?: () => void;
    onAutoLayout?: () => void;
    onToggleGrid?: () => void;
}

const CanvasPageLayout: React.FC<CanvasPageLayoutProps> = ({ children, ...props }) => {
    return (
        <div className="h-screen w-screen bg-[#0d0d12] overflow-hidden">
            {children}
        </div>
    );
};

export default CanvasPageLayout;
