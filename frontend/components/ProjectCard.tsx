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
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
      }`}
    >
      <h3 className="font-semibold text-gray-900 mb-1">{project.name}</h3>
      {project.description && (
        <p className="text-sm text-gray-600 mb-2">{project.description}</p>
      )}
      {project.role && (
        <span className={`inline-block px-2 py-1 text-xs rounded ${
          project.role === 'owner'
            ? 'bg-purple-100 text-purple-700'
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
  );
}


