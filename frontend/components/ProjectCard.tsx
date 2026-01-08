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
          ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-white shadow-lg shadow-primary-500/20'
          : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-xl hover:shadow-primary-500/10'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30 group-hover:shadow-xl group-hover:shadow-primary-500/40 transition-shadow">
          <span className="text-white font-bold text-sm">{project.name.charAt(0).toUpperCase()}</span>
        </div>
        {project.role && (
          <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${
            project.role === 'owner'
              ? 'bg-primary-100 text-primary-700'
              : project.role === 'admin'
              ? 'bg-blue-100 text-blue-700'
              : project.role === 'member'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-700'
          }`}>
            {project.role}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-primary-700 transition-colors">{project.name}</h3>
      {project.description && (
        <p className="text-sm text-gray-600 line-clamp-2">{project.description}</p>
      )}
    </div>
  );
}

