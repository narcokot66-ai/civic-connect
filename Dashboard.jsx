import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import api from '../services/api';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function getUpdateAgeStyle(dateString) {
  if (!dateString) return { bg: '#f1f5f9', color: '#64748b', label: 'Recent' };
  
  let updateDate;
  if (dateString.includes('.')) {
    const [day, month, year] = dateString.split(/[\s.:]+/);
    updateDate = new Date(`${year}-${month}-${day}`);
  } else {
    updateDate = new Date(dateString);
  }

  const diffDays = Math.floor((new Date() - updateDate) / (1000 * 60 * 60 * 24));

  if (diffDays <= 3) {
    return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' }; // Green: Recent
  } else if (diffDays <= 7) {
    return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' }; // Yellow: Moderate
  } else {
    return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' }; // Red: Stagnant
  }
}

export default function Dashboard() {
  const role = (localStorage.getItem('role') || 'CITIZEN').toUpperCase();
  const fullname = localStorage.getItem('fullname') || 'User';
  const token = localStorage.getItem('token');

  const [departments, setDepartments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [selectedMapPos, setSelectedMapPos] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterTime, setFilterTime] = useState(''); 
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pendingRole, setPendingRole] = useState(''); 
  const [pendingDept, setPendingDept] = useState('');
  const [activeVideoModal, setActiveVideoModal] = useState(null);
  const [activeMapCoords, setActiveMapCoords] = useState(null);
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [noteAttachments, setNoteAttachments] = useState({});
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, complaint: null });

  useEffect(() => {
  const fetchDepartments = async () => {
    try {
      const res = await fetch('http://localhost:8000/departments');
      const data = await res.json();
      setDepartments(data); // Expecting array of objects or strings, e.g., [{ name: 'Roads' }, ...]
    } catch (err) {
      console.error('Failed to load departments', err);
    }
  };
  fetchDepartments();
}, []);

 const dynamicCategories = Array.from(
    new Set(complaints.map(c => c.category || c.department).filter(Boolean))
  );

   // --- Add the Duplicate Detector Helper Here ---
  const getDuplicateCount = (currentComplaint) => {
    return complaints.filter(other => 
      other.id !== currentComplaint.id && 
      other.category === currentComplaint.category &&
      other.title.toLowerCase().split(' ').some(word => word.length > 3 && currentComplaint.title.toLowerCase().includes(word))
    ).length;
  };

 const handleSaveClick = (userId, selectedRole, selectedDept, originalRole) => {
  // Only show modal if elevated AND the role actually changed
  if ((selectedRole === 'AUTHORITY' || selectedRole === 'Admin') && selectedRole !== originalRole) {
    setPendingUserId(userId);
    setPendingRole(selectedRole);
    setPendingDept(selectedDept);
    setShowConfirmModal(true);
  } else {
    // Otherwise, save immediately without popping up the modal
    handleUpdateUser(userId, selectedRole, selectedDept);
  }
};
function LocationPicker({ position, setPosition, setGpsLocation }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      const formatted = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setPosition([lat, lng]);
      setGpsLocation(formatted);
    },
  });

  return position === null ? null : <Marker position={position}></Marker>;
}
  // Authority & Citizen filter states
  const [filterRegion, setFilterRegion] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [duplicateFilter, setDuplicateFilter] = useState('');

  const filteredComplaints = complaints.filter(c => {
  const duplicateCount = getDuplicateCount(c);
  const isDuplicate = duplicateCount > 0;
  const matchesRegion = !filterRegion || c.region === filterRegion;
  // If dropdown is set to 'duplicates', only show duplicate tickets
  const matchesDuplicateFilter = duplicateFilter !== 'duplicates' || isDuplicate;

  const cat = c.category || c.department || '';
  const matchesCategory = !filterCategory || filterCategory === 'ALL' || cat.toLowerCase() === filterCategory.toLowerCase();

  const matchesStatus = !filterStatus || c.status === filterStatus;

  // Time filter logic for authority view
  let matchesTime = true;
  if (filterTime) {
    const complaintDate = new Date(c.updated_at || c.created_at);
    const now = new Date();
    const diffTime = now - complaintDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (filterTime === 'recent' && diffDays > 1) matchesTime = false;
    if (filterTime === 'week' && diffDays > 7) matchesTime = false;
    if (filterTime === 'month' && diffDays > 30) matchesTime = false;
    if (filterTime === '6months' && diffDays > 180) matchesTime = false;
    if (filterTime === 'archive' && diffDays <= 365) matchesTime = false;
  }

  return matchesDuplicateFilter && matchesRegion && matchesCategory && matchesStatus && matchesTime;
}).sort((a, b) => {
  // Automatically bubble duplicate complaints up to the top
  const countA = getDuplicateCount(a);
  const countB = getDuplicateCount(b);
  return countB - countA;
});

  // Local state for internal officer notes, image modal, and toast notifications
  const [officerNotes, setOfficerNotes] = useState({});
  const [activeModalImage, setActiveModalImage] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Citizen complaint submission form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [gpsLocation, setGpsLocation] = useState('');

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const deptRes = await axios.get('http://localhost:8000/departments', { headers });
      setDepartments(deptRes.data);

      if (role && (role.toUpperCase() === 'ADMIN' || role.toUpperCase() === 'AUTHORITY')) {
      const params = new URLSearchParams();
      if (filterRegion) params.append('region', filterRegion);
      if (filterCategory) params.append('category', filterCategory);
      if (filterStatus) params.append('status', filterStatus);

      const compRes = await axios.get(`http://localhost:8000/officer/complaints?${params.toString()}`, { headers });
      
      const parsedComplaints = compRes.data.map((c) => ({
        ...c,
        internal_notes: typeof c.internal_notes === 'string'
          ? JSON.parse(c.internal_notes || '[]')
          : (c.internal_notes || [])
      }));

      setComplaints(parsedComplaints);
    } else {
      const compRes = await axios.get('http://localhost:8000/complaints/my', { headers });
      
      const parsedComplaints = compRes.data.map((c) => ({
        ...c,
        internal_notes: typeof c.internal_notes === 'string'
          ? JSON.parse(c.internal_notes || '[]')
          : (c.internal_notes || [])
      }));

      setComplaints(parsedComplaints);
    }

      if (role === 'ADMIN') {
        setLoading(true);
        const usersRes = await axios.get('http://localhost:8000/admin/users', { headers });
        setUsers(usersRes.data);
        setLoading(false);
      }
    } catch (err) {
      console.error("Error loading dashboard data", err);
      setLoading(false);
    }
  }, [token, role, filterRegion, filterCategory, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusUpdate = async (complaintId, newStatus) => {
    try {
      await axios.patch(`http://localhost:8000/complaints/${complaintId}/status`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(`Status updated to "${newStatus}" successfully!`);
      fetchData();
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  const handleMediaUpload = async (complaintId, files) => {
    if (!files || files.length === 0) return;

    try {
      const uploadedMediaItems = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        // Upload to FastAPI backend
        const res = await axios.post('http://localhost:8000/upload', formData, {
          headers: { 
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${localStorage.getItem('token')}` 
          }
        });

        uploadedMediaItems.push({
          type: file.type.startsWith('video/') ? 'video' : 'image',
          url: res.data.url // Saves server-relative path (e.g. "uploads/filename.png")
        });
      }

      setNoteAttachments(prev => ({
        ...prev,
        [complaintId]: [...(prev[complaintId] || []), ...uploadedMediaItems]
      }));
    } catch (err) {
      console.error("Failed to upload media files to server", err);
      alert("Failed to upload attached files.");
    }
  };

  const handleSaveNote = async (complaintId, ticketStatus) => {
  const noteText = officerNotes[complaintId];
  const mediaList = noteAttachments[complaintId] || [];

  if ((!noteText || !noteText.trim()) && mediaList.length === 0) return;

  const newNote = {
  author: role === 'AUTHORITY' ? 'Field Officer' : 'Admin',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  status: ticketStatus || 'Pending', 
  text: noteText,
  media: noteAttachments[complaintId] || []
};

  try {
    // 1. Send the new note to your FastAPI backend
    await axios.post(
      `http://localhost:8000/complaints/${complaintId}/notes`,
      newNote,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // 2. Clear out inputs for this card
    setOfficerNotes((prev) => ({ ...prev, [complaintId]: '' }));
    setNoteAttachments((prev) => ({ ...prev, [complaintId]: [] }));

    // 3. Re-fetch fresh data from FastAPI database
    fetchData();

    showToast(`Internal field note saved for ticket #${complaintId}`);
  } catch (err) {
    console.error('Error saving note:', err);
    alert('Failed to save note to backend database.');
  }
};

  const handleDeleteComplaint = async (complaintId, isDuplicate = false) => {
  try {
    await axios.delete(`http://localhost:8000/complaints/${complaintId}?is_duplicate=${isDuplicate}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    showToast(isDuplicate ? 'Duplicate deleted & citizen notified!' : 'Complaint deleted successfully.');
    fetchData();
  } catch (err) {
    console.error('Error deleting complaint:', err);
    alert('Failed to delete complaint.');
  }
};

  const handleUpdateUser = async (userId, newRole, newDeptId) => {
    try {
      await axios.put(`http://localhost:8000/admin/users/${userId}`,
        { role: newRole, department_id: newDeptId ? parseInt(newDeptId) : null },
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
      );
      showToast('User account updated successfully!');
      fetchData();
    } catch (err) {
      alert('Failed to update user.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await axios.delete(`http://localhost:8000/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('User deleted successfully.');
      fetchData();
    } catch (err) {
      alert('Failed to delete user.');
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    try {
      await api.post('/api/departments', { name: newDeptName });
      setNewDeptName('');
      showToast('Department created successfully!');
      fetchData();
    } catch (err) {
      alert('Failed to create department.');
    }
  };

 const handleDeleteDepartment = async (id) => {
    try {
        await api.delete(`/api/departments/${id}`);
        setDepartments(departments.filter((d) => d.id !== id));
    } catch (err) {
        console.error("Failed to delete department", err);
    }
};

  const handleGetGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
          setGpsLocation(coords);
          showToast('GPS coordinates fetched successfully.');
        },
        () => {
          alert('Unable to retrieve your location.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

 const handleCreateComplaint = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('category', category);
      formData.append('region', region);
      formData.append('gps_location', gpsLocation);
      
      if (imageFile && imageFile.length > 0) {
      for (let i = 0; i < imageFile.length; i++) 
        {
        formData.append('files', imageFile[i]); // Matches FastAPI backend parameter name
        }
    }

      await axios.post('http://localhost:8000/complaints', formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setTitle('');
      setDescription('');
      setCategory('');
      setRegion('');
      setImageFile([]);
      setGpsLocation('');
      showToast('Complaint ticket submitted successfully!');
      fetchData();
    } catch (err) {
      alert('Failed to submit complaint.');
    }
    finally {
    setIsSubmitting(false); 
  }
};

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  const getStatusBadgeStyle = (status) => {
    const st = (status || '').toLowerCase();
    if (st.includes('resolve')) return { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
    if (st.includes('progress')) return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
    return { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' };
  };

  const getRoleBadgeStyle = () => {
    if (role === 'ADMIN') return { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' };
    if (role === 'AUTHORITY') return { background: '#f0f9ff', color: '#c70202ee', border: '1px solid #bae6fd' };
    return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' };
  };

  const getRegionBadgeStyle = (region) => {
  if ((region || '').toLowerCase() === 'urban') {
    return { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
  }
  return { background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' };
};

  const authorityTotalCount = complaints.length;
  const authorityPendingCount = complaints.filter(c => (c.status || '').toLowerCase() === 'pending').length;
  const authorityResolvedCount = complaints.filter(c => (c.status || '').toLowerCase().includes('resolve')).length;

  // Filter logic for Citizen View client-side list rendering
  const filteredCitizenComplaints = complaints.filter(c => {
    if (role === 'CITIZEN') {
      const matchesRegion = filterRegion ? (c.region || '').toLowerCase() === filterRegion.toLowerCase() : true;
      const matchesStatus = filterStatus ? (c.status || '').toLowerCase() === filterStatus.toLowerCase() : true;
      const matchesCategory = filterCategory ? (c.category || '').toLowerCase().includes(filterCategory.toLowerCase()) : true;
      return matchesRegion && matchesStatus && matchesCategory;
    }
    return true;
  });

  return (
    <div style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif', minHeight: '100vh', background: '#f8fafc', color: '#0f172a' }}>
      
      {/* Modern Sleek Navigation */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '16px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'linear-gradient(135deg, #3d2314 0%, #5c3a21 100%)', color: 'white', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)' }}>
            C
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>Civic Connect Portal</h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Civic Issue Management and Resolution System</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f1f5f9', padding: '6px 14px', borderRadius: '30px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>{fullname}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', ...getRoleBadgeStyle() }}>
              {role}
            </span>
          </div>
          <button 
            onClick={handleLogout}
            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', transition: 'all 0.2s' }}
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '36px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* ================= ADMIN VIEW ================= */}
        {role === 'ADMIN' && (
          <>
            <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', color: 'white', padding: '32px', borderRadius: '20px', marginBottom: '28px', boxShadow: '0 10px 25px -5px rgba(124, 58, 237, 0.25)' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: '700' }}>System Administrator Console</h3>
              <p style={{ margin: 0, fontSize: '14px', opacity: 0.9, lineHeight: '1.5' }}>Full system oversight: manage global municipal user accounts, configure departments, and review queues.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
              <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Users</p>
                <h3 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{users.length}</h3>
              </div>
              <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Complaints</p>
                <h3 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{complaints.length}</h3>
              </div>
              <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Departments</p>
                <h3 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{departments.length}</h3>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '28px', marginBottom: '28px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>Department Management</h3>
              <form onSubmit={handleCreateDepartment} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="New Department Name (e.g., Sanitation, Roads)..." 
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  required
                  style={{ flex: 1, padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', background: '#f8fafc' }}
                />
                <button type="submit" style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)' }}>
                  + Add Department
                </button>
              </form>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {departments.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>
             <span>📁 {d.name}</span>
      <button onClick={() => handleDeleteDepartment(d.id)} style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', padding: '0 2px' }}>×</button>
    </div>
  ))}                
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '28px', marginBottom: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>User Account Management</h3>
              {loading ? <p style={{ color: '#64748b', fontSize: '14px' }}>Loading users...</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '12px' }}>ID</th>
                        <th style={{ padding: '12px' }}>Name</th>
                        <th style={{ padding: '12px' }}>Email</th>
                        <th style={{ padding: '12px' }}>Role</th>
                        <th style={{ padding: '12px' }}>Department</th>
                        <th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '14px 12px', color: '#94a3b8', fontWeight: '600' }}>#{u.id}</td>
                          <td style={{ padding: '14px 12px', fontWeight: '700', color: '#0f172a' }}>{u.fullname}</td>
                          <td style={{ padding: '14px 12px', color: '#475569' }}>{u.email}</td>
                          <td style={{ padding: '14px 12px' }}>
                            <select id={`role-${u.id}`} defaultValue={u.role} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc' }}>
                              <option value="CITIZEN">CITIZEN</option>
                              <option value="AUTHORITY">AUTHORITY</option>
                              <option value="Admin">Admin</option>
                            </select>
                          </td>
                          <td style={{ padding: '14px 12px' }}>
  <select
    id={`dept-${u.id}`}
    defaultValue={u.department_id || ''}
    disabled={u.role !== 'AUTHORITY'}
    style={{
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid #cbd5e1',
      fontSize: '14px',
      backgroundColor: u.role === 'AUTHORITY' ? '#fff' : '#f1f5f9',
      color: u.role === 'AUTHORITY' ? '#0f172a' : '#94a3b8',
      cursor: u.role === 'AUTHORITY' ? 'pointer' : 'not-allowed'
    }}
  >
    <option value="">-- None --</option>
    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
  </select>
</td>
     <td style={{ padding: '14px 12px', display: 'flex', gap: '8px' }}>
  <button
    // PUT IT HERE:
    onClick={() => {
      const selectedRole = document.getElementById(`role-${u.id}`).value;
      const selectedDept = document.getElementById(`dept-${u.id}`).value;
      handleSaveClick(u.id, selectedRole, selectedDept, u.role);
    }}
    style={{
      background: '#2563eb',
      color: 'white',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '600'
    }}
  >
    Save
  </button>
                 
                            
                            <button onClick={() => handleDeleteUser(u.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ================= AUTHORITY VIEW HEADER & METRICS ================= */}
        {role === 'AUTHORITY' && (
          <>
            <div style={{ background: 'linear-gradient(135deg, #d3240de1 0%, #d80707ea 100%)', color: 'white', padding: '32px', borderRadius: '20px', marginBottom: '24px', boxShadow: '0 10px 25px -5px rgba(14, 165, 233, 0.25)' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: '700' }}>Municipal Authority Workspace</h3>
              <p style={{ margin: 0, fontSize: '14px', opacity: 0.9, lineHeight: '1.5' }}>Review, filter, and update municipal complaints assigned to your official department queue.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
              <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Queue</p>
                <h3 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: '#ca2a02' }}>{authorityTotalCount}</h3>
              </div>
              <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Review</p>
                <h3 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: '#d97706' }}>{authorityPendingCount}</h3>
              </div>
              <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolved Tickets</p>
                <h3 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: '#059669' }}>{authorityResolvedCount}</h3>
              </div>
            </div>
          </>
        )}

        {/* ================= COMPLAINTS QUEUE & FILTER CONTROLS (ADMIN & AUTHORITY) ================= */}
        {(role === 'ADMIN' || role === 'AUTHORITY') && (
          <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px', gap: '15px' }}>
  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
    {role === 'ADMIN' ? 'Global Complaint Review Panel' : 'Department Complaint Queue'}
  </h3>

  {/* Right-side toolbar group containing ALL filters shoulder-to-shoulder */}
  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
    
  {/* 1. Duplicate Filter (Admin Only) */}
{role === 'ADMIN' && (
  <select
    value={duplicateFilter}
    onChange={(e) => setDuplicateFilter(e.target.value)}
    style={{
      padding: '8px 12px',
      borderRadius: '8px',
      border: '1px solid #cbd5e1',
      fontSize: '13px',
      background: '#ffffff',
      color: '#0f172a',
      outline: 'none',
      cursor: 'pointer'
    }}
  >
    <option value="">⚡ All Complaints</option>
    <option value="duplicates">⚠️ Only Duplicates</option>
  </select>
)}

{/* 2. Time Filter (Available to BOTH Admin & Authority) */}
<select
  value={filterTime}
  onChange={(e) => setFilterTime(e.target.value)}
  style={{
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    background: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    cursor: 'pointer'
  }}
>
  <option value="">⏳ All Time</option>
  <option value="recent">⚡ Recent (Last 24h)</option>
  <option value="week">📅 Past Week</option>
  <option value="month">📆 Past Month</option>
  <option value="year">📁 Past Year</option>
  <option value="archive">📑 Older Archives (1+ Years)</option>
</select>

    {/* 2. Region Filter */}
    <select 
      value={filterRegion} 
      onChange={(e) => setFilterRegion(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff', outline: 'none', cursor: 'pointer' }}
    >
      <option value="">🌍 All Regions</option>
      <option value="Urban">Urban</option>
      <option value="Rural">Rural</option>
    </select>

    {/* 3. Category Filter - Admin Only */}
{role !== 'AUTHORITY' && (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
  <select
    value={filterCategory}
    onChange={(e) => setFilterCategory(e.target.value)}
    style={{
      padding: '8px 12px',
      borderRadius: '8px',
      border: '1px solid #cbd5e1',
      fontSize: '13px',
      background: '#ffffff',
      outline: 'none',
      cursor: 'pointer',
      color: '#334155',
      fontWeight: '500'
    }}
  >
    <option value="">🔍 All Categories</option>
    {dynamicCategories.map((cat, idx) => (
      <option key={idx} value={cat}>
        {cat}
      </option>
    ))}
  </select>
</div>
)}

    {/* 4. Status Filter */}
    <select 
      value={filterStatus} 
      onChange={(e) => setFilterStatus(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff', outline: 'none', cursor: 'pointer' }}
    >
      <option value="">📌 All Statuses</option>
      <option value="Pending">Pending</option>
      <option value="In Progress">In Progress</option>
      <option value="Resolved">Resolved</option>
    </select>

  </div>
</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {loading ? (
  <div style={{ background: 'white', padding: '48px', textAlign: 'center', borderRadius: '20px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>
    ⏳ Loading department queue...
  </div>
) : filteredComplaints.length === 0 ? (
<div style={{ background: 'white', padding: '48px', textAlign: 'center', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
    No complaints found matching your current filter criteria.
</div>
) : (
    filteredComplaints.map((c) => (
                  <div key={c.id} style={{ background: 'white', padding: '24px 28px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#0f172a' }}>{c.title}</h4>
                        <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', ...getStatusBadgeStyle(c.status) }}>
                          {c.status}
                        </span>
                        {/* Duplicate Warning Badge - Admin Only */}
                        {role === 'ADMIN' && getDuplicateCount(c) > 0 && (
                       <span style={{ fontSize: '12px', fontWeight: '600', padding: '4px 10px', borderRadius: '20px' }}>
                       ⚠️ Possible Duplicate ({getDuplicateCount(c)} similar)
                       </span>
                        )}
                      </div>                     
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#475569', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', fontWeight: '500' }}>Category: <strong style={{ color: '#0f172a' }}>{c.category}</strong></span>
                        {role !== 'ADMIN' && (
  <select value={c.status} onChange={(e) => handleStatusUpdate(c.id, e.target.value)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                        </select>
                        )}
                        {role === 'ADMIN' && (
  <button 
    onClick={() => setDeleteModal({ isOpen: true, complaint: c })} 
    style={{
      background: '#fef2f2',
      color: '#ef4444',
      border: '1px solid #fecaca',
      padding: '6px 12px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '12px'
    }}
  >
    Delete
  </button>
)}
                      </div>
                    </div>
                    {/* 1. Paragraph tag properly closed */}
<p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
  {c.description}
</p>
{(() => {
  const dateVal = c.updated_at || c.last_update;
  const ageStyle = getUpdateAgeStyle(dateVal);
  const formattedDate = dateVal ? new Date(dateVal).toLocaleString() : 'N/A';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginTop: '6px' }}>
      <span style={{ color: '#64748b' }}>🕒 Last Updated:</span>
      <span style={{
        padding: '2px 8px',
        borderRadius: '6px',
        fontWeight: '600',
        backgroundColor: ageStyle.bg,
        color: ageStyle.color,
        border: `1px solid ${ageStyle.border}`
      }}>
        {formattedDate}
      </span>
    </div>
  );
})()}
                    {/* Image Thumbnail Preview & Metadata */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '14px', borderTop: '1px solid #f1f5f9', marginBottom: '16px' }}>
                      {(c.image_url || c.gps_location || c.region) && (
                        <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
  {c.region && (
  <span style={{
    fontSize: '12px',
    fontWeight: '600',
    padding: '3px 10px',
    borderRadius: '20px',
    backgroundColor: c.region === 'Urban' ? '#dcfce7' : '#dbeafe',
    color: c.region === 'Urban' ? '#166534' : '#1e40af'
  }}>
    📍 Region: {c.region}
  </span>
)}
  {c.gps_location && (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0f172a' }}>
      🧭 GPS Coordinates: 
      <strong 
        onClick={() => setActiveMapCoords(c.gps_location)}
        style={{ 
          color: '#0284c7', 
          cursor: 'pointer', 
          textDecoration: 'underline',
          fontWeight: '600'
        }}
        title="Click to view location on map"
      >
        {c.gps_location}
      </strong>
    </span>
  )}
</div>
                      )}
                      {c.image_url && (
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', alignItems: 'center' }}>
    {String(c.image_url).split(',').map((url, index) => {
      const cleanUrl = url.trim();
      if (!cleanUrl) return null;
      const isVideo = cleanUrl.match(/\.(mp4|mov|avi|webm)$/i);
      
      return (
        <a 
          key={index}
          href={cleanUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            position: 'relative',
            display: 'inline-block',
            width: '80px',
            height: '80px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #cbd5e1',
            flexShrink: '0',
            backgroundColor: '#000',
            cursor: 'pointer'
          }}
          title="Click to view full media in new tab"
        >
          {isVideo ? (
            <video 
              src={cleanUrl} 
              style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            />
          ) : (
            <img 
              src={cleanUrl} 
              alt="Complaint Attachment" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}

          {/* Badge Overlay with Icon */}
          <span style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: '600',
            padding: '2px 5px',
            borderRadius: '4px',
            pointerEvents: 'none',
            letterSpacing: '0.3px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px'
          }}>
            {isVideo ? '▶ Video' : '📷 Photo'}
          </span>
        </a>
      );
    })}
  </div>
)}                   
                    </div>
                        {/* Internal Officer Notes Section */}
<div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', marginTop: '14px' }}>
  <p style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: '800', color: '#475569', letterSpacing: '0.5px' }}>
    INTERNAL TEAM NOTES & FIELD REMARKS
  </p>

  {/* 1. SAVED NOTES LOG */}
  {c.internal_notes && c.internal_notes.length > 0 ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: role === 'AUTHORITY' ? '12px' : '0' }}>
      {c.internal_notes.map((note, idx) => (
        <div key={idx} style={{ background: 'white', padding: '10px 14px', borderRadius: '8px', borderLeft: '4px solid #c71902f5', border: '1px solid #cbd5e1', fontSize: '13px', color: '#0f172a' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <span>📌 {note.author || 'Field Officer'} • {note.timestamp}</span>
  
  {/* Status Badge inside the header div */}
  {note.status && (
    <span style={{
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: '700',
      textTransform: 'uppercase',
      backgroundColor: 
        note.status.toLowerCase() === 'resolved' ? '#dcfce7' :
        note.status.toLowerCase() === 'in progress' ? '#fef3c7' : '#fee2e2',
      color: 
        note.status.toLowerCase() === 'resolved' ? '#15803d' :
        note.status.toLowerCase() === 'in progress' ? '#b45309' : '#b91c1c'
    }}>
      {note.status}
    </span>
  )}
</div>
          

          {note.text && <div>{note.text}</div>}

           {/* Media Proof Grid */}
{note.media && note.media.length > 0 && (
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
    {note.media.map((item, mIdx) => {
      const mediaUrl = item.url.startsWith('http') ? item.url : `http://localhost:8000/${item.url}`;
      return (
        <div 
          key={mIdx} 
          onClick={() => window.open(mediaUrl, '_blank')}
          style={{ width: '70px', height: '70px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1', cursor: 'pointer', position: 'relative' }}
          title="Click to open full media"
        >
          {item.type === 'image' || item.url.match(/\.(jpeg|jpg|png|gif)$/i) ? (
  <img 
    src={mediaUrl} 
    alt="Proof" 
    onError={(e) => { e.target.style.display = 'none'; }} 
    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
  />
) : (
  <video 
    src={mediaUrl} 
    onError={(e) => { e.target.style.display = 'none'; }} 
    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
  />
)}
        </div>
      );
    })}
  </div>
)}            
        </div>
      ))}
    </div>
  ) : (
    /* Fallback message when no notes exist */
    <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
      No field notes or media proof recorded for this ticket yet.
    </div>
  )}

  {/* 2. INPUT ROW (AUTHORITY ONLY) */}
  {role === 'AUTHORITY' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
      
      {/* Selected Media Count Badge */}
      {noteAttachments && noteAttachments[c.id] && noteAttachments[c.id].length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {noteAttachments[c.id].map((m, idx) => (
            <span key={idx} style={{ fontSize: '11px', background: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
              📎 {m.type === 'image' ? 'Photo' : 'Video'} {idx + 1}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="Add internal progress note (e.g., dispatch team en route)..."
          value={officerNotes[c.id] || ''}
          onChange={(e) => setOfficerNotes({ ...officerNotes, [c.id]: e.target.value })}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        />

        <label style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
          📷 Attach Proof
          <input 
            type="file" 
            accept="image/*,video/*" 
            multiple 
            style={{ display: 'none' }} 
            onChange={(e) => handleMediaUpload(c.id, e.target.files)} 
          />
        </label>

        <button
          type="button"
          onClick={() => handleSaveNote(c.id, c.status)}
          style={{ background: '#c71902f5', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap' }}
        >
          Save Note
        </button>
      </div>
    </div>
  )}
</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ================= CITIZEN VIEW ================= */}
        {role === 'CITIZEN' && (
          <>
            <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: 'white', padding: '32px', borderRadius: '20px', marginBottom: '28px', boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.25)' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: '700' }}>Citizen Services Portal</h3>
              <p style={{ margin: 0, fontSize: '14px', opacity: 0.9, lineHeight: '1.5' }}>Report local civic infrastructure issues quickly, attach location details, and track progress updates.</p>
            </div>

            <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '32px', marginBottom: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Submit a New Complaint</h3>
              <form onSubmit={handleCreateComplaint} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Complaint Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Broken Streetlight on Main Avenue" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    required 
                    style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box', background: '#f8fafc', outline: 'none' }} 
                  />
                </div>               
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
  <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Region</label>
  <select
    value={region}
    onChange={(e) => setRegion(e.target.value)}
    required
    style={{ 
      padding: '12px 16px', 
      borderRadius: '10px', 
      border: '1px solid #cbd5e1', 
      fontSize: '14px',
      background: 'white',
      color: region ? '#0f172a' : '#94a3b8'
    }}
  >
    <option value="">Select Region</option>
    <option value="Urban">Urban</option>
    <option value="Rural">Rural</option>
  </select>
</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
  <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Category</label>
  <select
    value={category}
    onChange={(e) => setCategory(e.target.value)}
    required
    style={{ 
      padding: '12px 16px', 
      borderRadius: '10px', 
      border: '1px solid #cbd5e1', 
      fontSize: '14px',
      background: 'white',
      color: category ? '#0f172a' : '#94a3b8'
    }}
  >
    <option value="">Select Category</option>
    {departments.map((dept) => (
      <option key={dept.id} value={dept.name}>
        {dept.name}
      </option>
    ))}
  </select>
</div>
                </div>

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
  
  {/* LEFT COLUMN: Upload Media Attachments & 2-Column Grid */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>
      Upload Media Attachments (Multiple Photos / Videos)
    </label>
    <input
      type="file"
      multiple
      accept="image/*,video/*"
      onChange={(e) => {
      const selectedFiles = Array.from(e.target.files);
      const videoFiles = selectedFiles.filter(file => file.type && file.type.startsWith('video/'));
      const currentCount = imageFile ? imageFile.length : 0;

      const exceedsVideos = videoFiles.length > 5;
      const exceedsTotal = (currentCount + selectedFiles.length) > 10;

      // 1. Violation of BOTH limits simultaneously
      if (exceedsVideos && exceedsTotal) {
        alert("⚠️ Notice: You have exceeded both the maximum limit of 5 video files and the total limit of 10 attachments per complaint.");
        return;
      }
      
      // 2. Violation of Video limit only
      if (exceedsVideos) {
        alert("⚠️ Notice: You can attach a maximum of 5 video files per complaint to ensure fast upload performance.");
        return;
      }
      
      // 3. Violation of Total file limit only
      if (exceedsTotal) {
        alert("⚠️ Notice: Total attachments cannot exceed 10 files per complaint.");
        return;
      }
      
      setImageFile(selectedFiles);
    }}
      style={{ padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc' }}
    />

    {imageFile && imageFile.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '8px', maxHeight: '220px', overflowY: 'auto' }}>
        {Array.from(imageFile).map((file, index) => {
          const isImage = file.type.startsWith('image/');
          const previewUrl = isImage ? URL.createObjectURL(file) : null;

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between', // Keeps elements evenly spaced
                gap: '6px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#1e293b',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                {isImage ? (
  <img
    src={previewUrl}
    alt="preview"
    onClick={() => setActiveModalItem({ url: previewUrl, type: 'image' })}
    style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
    title="Click to view image"
  />
) : (
  <span 
    onClick={() => setActiveModalItem({ url: URL.createObjectURL(file), type: 'video' })}
    style={{ fontSize: '16px', cursor: 'pointer', flexShrink: 0 }}
    title="Click to play video"
  >
    🎬
  </span>
)}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {file.name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const updatedFiles = Array.from(imageFile).filter((_, i) => i !== index);
                  setImageFile(updatedFiles);
                }}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    )}

    {imageFile && imageFile.length > 0 && (
      <button
        type="button"
        onClick={() => setImageFile([])}
        style={{
          marginTop: '6px',
          background: 'transparent',
          color: '#ef4444',
          border: '1px solid #ef4444',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          alignSelf: 'flex-start'
        }}
      >
        Clear All
      </button>
    )}

    <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
      💡 Tip: Select files to view visual thumbnails and remove individual items easily.
    </span>
  </div>

  {/* RIGHT COLUMN: GPS Coordinates (Top) & Interactive Map Picker (Bottom) */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    
    {/* GPS Input Block */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>GPS Coordinates</label>
      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="Latitude, Longitude"
          value={gpsLocation}
          onChange={(e) => setGpsLocation(e.target.value)}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc' }}
        />
        <button
          type="button"
          onClick={handleGetGPS}
          style={{ background: '#2563eb', color: 'white', border: 'none', padding: '0 18px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
        >
          📍 Auto GPS
        </button>
      </div>
    </div>

    {/* Map Picker Block */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>
        Pin Location on Map (Click anywhere to drop pin)
      </label>
      <div style={{ height: '220px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
        <MapContainer 
          center={[15.4909, 73.8278]} 
          zoom={11} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationPicker 
            position={selectedMapPos} 
            setPosition={setSelectedMapPos} 
            setGpsLocation={setGpsLocation} 
          />
        </MapContainer>
      </div>
    </div>

  </div>

</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Detailed Description</label>
                  <textarea 
                    placeholder="Provide clear details regarding the issue location and severity..." 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    required 
                    rows="3" 
                    style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box', background: '#f8fafc', fontFamily: 'inherit', outline: 'none' }}
                  ></textarea>
                </div>

               <button 
  type="submit"
  disabled={isSubmitting}
  style={{ 
    background: isSubmitting ? '#94a3b8' : '#059669', 
    color: 'white', 
    border: 'none', 
    padding: '14px 28px', 
    borderRadius: '10px',
    cursor: isSubmitting ? 'not-allowed' : 'pointer',
    fontWeight: '600',
    fontSize: '15px',
    transition: 'background 0.2s'
  }}
>
  {isSubmitting ? 'Submitting Ticket...' : 'Submit Complaint Ticket'}
</button>
              </form>
            </div>

            {/* Citizen Queue Header & Filter Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>My Submitted Complaints</h3>
              
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>                               
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
  {/* All Regions Filter Button */}
  <button
    onClick={() => setFilterRegion('')}
    style={{
      padding: '8px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      backgroundColor: filterRegion === '' ? '#334155' : '#f1f5f9',
      color: filterRegion === '' ? '#ffffff' : '#475569',
      border: 'none',
      cursor: 'pointer'
    }}
  >
    All Regions
  </button>

  {/* Urban Filter Button */}
  <button
    onClick={() => setFilterRegion('Urban')}
    style={{
      padding: '8px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      backgroundColor: filterRegion === 'Urban' ? '#166534' : '#f1f5f9',
      color: filterRegion === 'Urban' ? '#ffffff' : '#166534',
      border: '1px solid #166534',
      cursor: 'pointer'
    }}
  >
    Urban
  </button>

  {/* Rural Filter Button */}
  <button
    onClick={() => setFilterRegion('Rural')}
    style={{
      padding: '8px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      backgroundColor: filterRegion === 'Rural' ? '#1e40af' : '#f1f5f9',
      color: filterRegion === 'Rural' ? '#ffffff' : '#1e40af',
      border: '1px solid #1e40af',
      cursor: 'pointer'
    }}
  >
    Rural
  </button>
</div>

                <input 
                  type="text" 
                  placeholder="🔍 Search Category..." 
                  value={filterCategory} 
                  onChange={(e) => setFilterCategory(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', fontWeight: '600', color: '#334155', outline: 'none' }}
                />

                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', fontWeight: '600', color: '#334155', cursor: 'pointer' }}>
                  <option value="">📌 All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredCitizenComplaints.length === 0 ? (
                <div style={{ background: 'white', padding: '48px', textAlign: 'center', borderRadius: '20px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>
                  No complaints found matching your filter criteria.
                </div>
              ) : (
                filteredCitizenComplaints.map((c) => (
                  <div key={c.id} style={{ background: 'white', padding: '24px 28px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#0f172a' }}>{c.title}</h4>
                      <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', ...getStatusBadgeStyle(c.status) }}>
                        {c.status}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>{c.description}</p>
                    <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '24px', paddingTop: '14px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                      <span>🏷️ Category: <strong style={{ color: '#0f172a' }}>{c.category}</strong></span>
                      <span>📍 Region: <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', ...getRegionBadgeStyle(c.region) }}>{c.region}</span></span>
                      {c.image_url && (() => {
  const mediaUrls = c.image_url.split(',');
  const displayUrls = mediaUrls.slice(0, 10);

  return (
    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
        {displayUrls.map((url, index) => {
          const trimmedUrl = url.trim();
          const isVideo = trimmedUrl.endsWith('.mp4') || trimmedUrl.endsWith('.webm') || trimmedUrl.endsWith('.mov');
          
          return (
            <a 
              key={index} 
              href={trimmedUrl} 
              target="_blank" 
              rel="noreferrer" 
              style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}
            >
              {isVideo ? (
                <video 
                  src={trimmedUrl} 
                  width="84" 
                  height="84" 
                  style={{ objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                />
              ) : (
                <img 
                  src={trimmedUrl} 
                  alt="Issue Thumbnail" 
                  style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                />
              )}
              
              <span style={{
                position: 'absolute',
                bottom: '5px',
                right: '5px',
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                color: '#ffffff',
                padding: '2px 4px',
                borderRadius: '4px',
                fontSize: '8px',
                fontWeight: '600',
                backdropFilter: 'blur(2px)',
                pointerEvents: 'none',
                letterSpacing: '0.3px'
              }}>
                {isVideo ? '▶ Video' : '📷 Photo'}
              </span>
            </a>
          );
        })}
      </div>

      {c.latitude && c.longitude && (
        <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: '500', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
          <span>🧭 GPS:</span> {c.latitude}, {c.longitude}
        </div>
      )}
    </div>
  );
})()}
                      {c.gps_location && <span>🧭 GPS: <strong style={{ color: '#0f172a' }}>{c.gps_location}</strong></span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

      </main>

      {/* Image Lightbox Modal Viewer */}
      {activeModalImage && (
        <div 
          onClick={() => setActiveModalImage(null)}
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '24px' }}
        >
          <div style={{ position: 'relative', maxWidth: '850px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <img 
              src={activeModalImage} 
              alt="Enlarged Attachment" 
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', background: 'white', display: 'block' }} 
            />
            <button 
              onClick={() => setActiveModalImage(null)}
              style={{ position: 'absolute', top: '-14px', right: '-14px', background: '#0f172a', color: 'white', border: '2px solid white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Real-time Status Toast Feedback Banner */}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: '#0f172a', color: 'white', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 110, fontSize: '14px', fontWeight: '600', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ color: '#34d399', fontSize: '18px' }}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
      {showConfirmModal && (
  <div style={{
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', 
    justifyContent: 'center', alignItems: 'center', zIndex: 1000
  }}>
    <div style={{
      background: 'white', padding: '24px', borderRadius: '12px', 
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxWidth: '400px', textAlign: 'center'
    }}>
      <h3 style={{ marginBottom: '12px', color: '#1e293b' }}>Confirm Privilege Change</h3>
      <p style={{ marginBottom: '20px', color: '#475569', fontSize: '15px' }}>
        Do you want to change role to{' '}
        <span style={{ 
          color: pendingRole === 'Admin' ? '#7c3aed' : '#dc2626', 
          fontWeight: '700',
          backgroundColor: pendingRole === 'Admin' ? '#f3e8ff' : '#fee2e2',
          padding: '2px 8px',
          borderRadius: '4px'
        }}>
          {pendingRole}
        </span>?
      </p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button 
          onClick={() => {
            handleUpdateUser(pendingUserId, pendingRole, pendingDept);
            setShowConfirmModal(false);
          }}
          style={{
            background: pendingRole === 'Admin' ? '#7c3aed' : '#dc2626',
            color: 'white', border: 'none', padding: '8px 16px', 
            borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
          }}
        >
          Yes, Change
        </button>
        <button 
          onClick={() => {
          document.getElementById(`role-${pendingUserId}`).value = users.find(u => u.id === pendingUserId)?.role || 'CITIZEN';
          setShowConfirmModal(false);
      }}
       style={{
       background: '#e2e8f0', color: '#334155', border: 'none', 
       padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
      }}
      >
       Cancel
      </button>
      </div>
    </div>
  </div>
)}

{activeVideoModal && (
  <div 
    onClick={() => setActiveVideoModal(null)}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
  >
    <div style={{ position: 'relative', maxWidth: '90%', maxH: '90%' }} onClick={(e) => e.stopPropagation()}>
      <video src={activeVideoModal} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px' }} />
      <button 
        type="button" 
        onClick={() => setActiveVideoModal(null)}
        style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontWeight: 'bold', cursor: 'pointer' }}
      >
        ×
      </button>
    </div>
  </div>
)}
{activeModalItem && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
    <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
      <button
        type="button"
        onClick={() => setActiveModalItem(null)}
        style={{ position: 'absolute', top: '-35px', right: '0', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        ✕
      </button>

      {activeModalItem.type === 'image' ? (
        <img 
          src={activeModalItem.url} 
          alt="Full size preview" 
          style={{ 
            maxWidth: '90vw', 
            maxHeight: '90vh', 
            width: 'auto', 
            height: 'auto', 
            borderRadius: '8px', 
            display: 'block',
            objectFit: 'contain'
          }} 
        />
      ) : (
        <video 
          src={activeModalItem.url} 
          controls 
          autoPlay 
          style={{ maxWidth: '80vw', maxHeight: '80vh', borderRadius: '8px' }} 
        />
      )}
    </div>
  </div>
)}
{activeMapCoords && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '16px',
      width: '90%',
      maxWidth: '600px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Complaint Location Map</h3>
        <button 
          onClick={() => setActiveMapCoords(null)}
          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          &times;
        </button>
      </div>

      <div style={{ width: '100%', height: '350px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
        <iframe
          title="Complaint GPS Map"
          width="100%"
          height="100%"
          frameBorder="0"
          style={{ border: 0 }}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(activeMapCoords)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
          allowFullScreen
        ></iframe>
      </div>
    </div>
  </div>
)}
{deleteModal.isOpen && (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      background: '#ffffff', borderRadius: '12px', padding: '24px',
      maxWidth: '420px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ marginTop: 0, color: '#0f172a' }}>Delete Ticket #{deleteModal.complaint?.id}</h3>
      <p style={{ color: '#475569', fontSize: '14px' }}>
        How would you like to process deleting this report?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={() => {
            handleDeleteComplaint(deleteModal.complaint.id, true);
            setDeleteModal({ isOpen: false, complaint: null });
          }}
          style={{
            padding: '10px 14px', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontWeight: '600', fontSize: '13px', textAlign: 'left'
          }}
        >
          💌 Delete & Send "Duplicate Encouragement" Email
        </button>

        <button
          onClick={() => {
            handleDeleteComplaint(deleteModal.complaint.id, false);
            setDeleteModal({ isOpen: false, complaint: null });
          }}
          style={{
            padding: '10px 14px', background: '#f1f5f9', color: '#475569',
            border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer',
            fontWeight: '500', fontSize: '13px', textAlign: 'left'
          }}
        >
          🗑️ Standard Delete (No Email)
        </button>

        <button
          onClick={() => setDeleteModal({ isOpen: false, complaint: null })}
          style={{
            padding: '8px 14px', background: 'transparent', color: '#94a3b8',
            border: 'none', cursor: 'pointer', fontSize: '13px', marginTop: '5px'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
</div>
  );
}
