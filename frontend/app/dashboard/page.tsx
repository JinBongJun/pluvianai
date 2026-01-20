'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { projectsAPI, Project } from '@/lib/api';
import ProjectCard from '@/components/ProjectCard';
import { useToast } from '@/components/ToastContainer';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Search, Plus } from 'lucide-react';
import { ShortLoading } from '@/components/ui/LoadingStates';
import Skeleton from '@/components/ui/Skeleton';
import posthog from 'posthog-js';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Check if create modal should be shown
    if (searchParams?.get('create') === 'true') {
      setShowCreateModal(true);
    }

    loadProjects();
  }, [router, searchParams]);

  const loadProjects = async () => {
    try {
      const data = await projectsAPI.list();
      setProjects(data);
      setFilteredProjects(data);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load projects', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.showToast('Project name is required', 'warning');
      return;
    }

    try {
      await projectsAPI.create({
        name: newProjectName,
        description: newProjectDescription || undefined,
      });
      posthog.capture('project_created', {
        has_description: !!newProjectDescription,
      });
      setNewProjectName('');
      setNewProjectDescription('');
      setShowCreateModal(false);
      toast.showToast('Project created successfully', 'success');
      loadProjects();
      router.push('/dashboard');
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to create project', 'error');
    }
  };

  // Search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProjects(projects);
    } else {
      const filtered = projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredProjects(filtered);
    }
  }, [searchQuery, projects]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Projects</h1>
              <p className="text-slate-400">Monitor and manage your LLM projects</p>
            </div>
            <ShortLoading text="Loading projects..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">Projects</h1>
            <p className="text-slate-400 mt-2">Manage your LLM monitoring projects</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Project
          </Button>
        </div>

        {/* Search Bar */}
        {projects.length > 0 && (
          <div className="mb-6 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
        )}

        {/* Projects Grid */}
        {filteredProjects.length === 0 && projects.length > 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-12 text-center shadow-2xl">
            <p className="text-slate-400">No projects found matching &quot;{searchQuery}&quot;</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-12 text-center shadow-2xl">
            <div className="max-w-md mx-auto">
              <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-purple-700/20 flex items-center justify-center border border-purple-500/30">
                <Plus className="h-8 w-8 text-purple-400" />
              </div>
              <p className="text-slate-400 mb-6 text-lg">No projects yet. Create your first project to get started.</p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => router.push(`/dashboard/${project.id}`)}
                isSelected={false}
              />
            ))}
          </div>
        )}

        {/* Create Project Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setNewProjectName('');
            setNewProjectDescription('');
          }}
          title="Create New Project"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Project Name *
              </label>
              <Input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My Project"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateProject();
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Description
              </label>
              <textarea
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500 text-white placeholder:text-slate-500 sm:text-sm"
                rows={3}
                placeholder="Optional description"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateProject}>
                Create
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
