import axios from 'axios';

const API = axios.create({
  baseURL: `http://${window.location.hostname}:8000`,
});

API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export default API;