import axios from 'axios';

const axiosClient = axios.create({
  baseURL: 'http://localhost:5000/api', 
  headers: { 'Content-Type': 'application/json' }
});

axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('payroll_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('payroll_auth_token');
      localStorage.removeItem('payroll_auth_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosClient;