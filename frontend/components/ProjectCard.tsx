'use client';

import { Project } from '@/lib/api';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  isSelected: boolean;
}

export default function ProjectCard({ project, onClick, isSelected }: ProjectCardProps) {
  return (
    <div
      onClick={onClick}
      className={`group p-6 rounded-xl border cursor-pointer transition-all duration-300 transform hover:scale-[1.02] ${
        isSelected
          ? 'border-ag-accent bg-ag-accent/5 shadow-lg shadow-ag-accent/10'
          : 'border-white/10 bg-ag-surface hover:border-ag-accent/50 hover:shadow-xl hover:shadow-ag-accent/5'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-ag-primary to-ag-primaryHover flex items-center justify-center shadow-lg shadow-ag-primary/30 group-hover:shadow-xl group-hover:shadow-ag-primary/40 transition-shadow">
          <span className="text-ag-accent-light font-bold text-sm">{project.name.charAt(0).toUpperCase()}</span>
        </div>
        {project.role && (
          <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${
            project.role === 'owner'
              ? 'bg-ag-accent/20 text-ag-accentLight'
              : project.role === 'admin'
              ? 'bg-sky-500/20 text-sky-300'
              : project.role === 'member'
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-white/10 text-ag-muted'
          }`}>
            {project.role}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-ag-text mb-2 group-hover:text-ag-accent transition-colors">{project.name}</h3>
      {project.description && (
        <p className="text-sm text-ag-muted line-clamp-2">{project.description}</p>
      )}
    </div>
  );
}

