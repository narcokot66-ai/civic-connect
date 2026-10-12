import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:8000', // Change to your FastAPI port if it's not 8000
});

API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export default API;