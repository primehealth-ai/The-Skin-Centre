'use client'
import { useState } from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Search, UserPlus, Eye, Tag } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils/formatters'
import { Database } from '@/types/database'

type Patient = Database['public']['Tables']['patients']['Row']

interface PatientsTableProps {
  patients: Patient[]
  onViewDetails: (patient: Patient) => void
  onAddPatient?: () => void
}

export function PatientsTable({ patients, onViewDetails, onAddPatient }: PatientsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Extract all unique tags safely
  const allTags = Array.from(
    new Set(patients.flatMap((p) => p.tags || []))
  )

  const filtered = patients.filter((p) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      (p.full_name && p.full_name.toLowerCase().includes(term)) ||
      p.phone.includes(term) ||
      (p.email && p.email.toLowerCase().includes(term))

    const matchesTag = selectedTag === 'all' || (p.tags && p.tags.includes(selectedTag))

    return matchesSearch && matchesTag
  })

  // Pagination calculations
  const totalItems = filtered.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedPatients = filtered.slice(startIndex, startIndex + itemsPerPage)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search patients by name, number..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1) // Reset to page 1
              }}
              className="w-full bg-white dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 py-2 text-slate-750 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <select
            value={selectedTag}
            onChange={(e) => {
              setSelectedTag(e.target.value)
              setCurrentPage(1) // Reset to page 1
            }}
            className="bg-white dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        {onAddPatient && (
          <Button onClick={onAddPatient} className="flex items-center gap-1.5 w-full sm:w-auto shadow-sm font-bold text-xs py-2 px-4">
            <UserPlus className="h-4 w-4" />
            Add Patient
          </Button>
        )}
      </div>

      {/* Grid Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-3.5">Name</th>
                <th className="px-6 py-3.5">Phone Number</th>
                <th className="px-6 py-3.5">Gender</th>
                <th className="px-6 py-3.5">Date of Birth</th>
                <th className="px-6 py-3.5">Treatment Tags</th>
                <th className="px-6 py-3.5">Registered</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {paginatedPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center font-bold text-slate-400 dark:text-slate-500">
                    No patients found.
                  </td>
                </tr>
              ) : (
                paginatedPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100">
                      {patient.full_name || 'Unnamed Patient'}
                    </td>
                    <td className="px-6 py-4 font-semibold">
                      {formatPhoneNumber(patient.phone)}
                    </td>
                    <td className="px-6 py-4 capitalize font-semibold">
                      {patient.gender || 'N/A'}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">
                      {patient.date_of_birth || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {patient.tags && patient.tags.length > 0 ? (
                          patient.tags.map((tag) => (
                            <Badge key={tag} variant="primary" className="flex items-center gap-0.5 font-bold">
                              <Tag className="h-2.5 w-2.5" />
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                            No tags
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-semibold">
                      {new Date(patient.created_at).toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewDetails(patient)}
                        className="inline-flex items-center gap-1.5 font-bold text-xs py-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Profile
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/40">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">
              Page {currentPage} of {totalPages} ({totalItems} total patients)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="py-1 px-3 font-bold"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="py-1 px-3 font-bold"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
