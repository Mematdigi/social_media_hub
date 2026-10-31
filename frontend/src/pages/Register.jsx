import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const validate = () => {
    const newErrors = {};
    if (!name) newErrors.name = 'Name is required';
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email format';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await register(name, email, password);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error) {
      const message = error.response?.data?.detail || 'Registration failed';
      toast.error(message);
      setErrors({ form: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex sh-app-bg">
      {/* Left side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden m-3 mr-0 rounded-[1.75rem] shadow-pop">
        <img
          src="https://images.unsplash.com/photo-1722528490197-fcad1006e762?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwxfHwzZCUyMGFic3RyYWN0JTIwc2hhcGVzJTIwY29sb3JmdWwlMjBwbGF5ZnVsfGVufDB8fHx8MTc3Mjg4MjM3M3ww&ixlib=rb-4.1.0&q=85"
          alt="Abstract background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-700/35 via-purple-600/10 to-pink-500/25" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#1e1240]/85 via-[#2a1657]/40 to-transparent" />
        <div className="relative z-10 flex flex-col justify-between w-full p-10 xl:p-14">
          <div className="inline-flex items-center gap-2.5 self-start h-11 pl-1.5 pr-4 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25">
            <div className="sh-logo-mark !w-8 !h-8 !rounded-[0.625rem]">
              <Sparkles />
            </div>
            <span className="font-heading font-semibold text-white tracking-tight">SocialHub</span>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="max-w-xl text-4xl xl:text-[2.75rem] leading-[1.1] font-heading font-bold text-white mb-4 drop-shadow-sm">
              Start your social media journey
            </h2>
            <p className="max-w-md text-lg text-white/85 leading-relaxed">
              Join thousands of creators and businesses managing their presence with SocialHub.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="relative flex-1 flex items-center justify-center px-5 py-10 sm:p-10 overflow-hidden">
        <span className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full [background:radial-gradient(closest-side,rgb(192 132 252/0.32),transparent)]" />
        <span className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full [background:radial-gradient(closest-side,rgb(244 114 182/0.24),transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-[420px]"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="sh-logo-mark sh-logo-mark--lg">
              <Sparkles />
            </div>
            <span className="font-heading font-bold text-2xl tracking-tight text-slate-900">SocialHub</span>
          </div>

          <div className="sh-card p-6 sm:p-8 shadow-pop">

          <h1 className="text-[1.75rem] sm:text-3xl font-heading font-bold text-slate-900 mb-1.5">
            Create an account
          </h1>
          <p className="text-slate-500 mb-7">
            Get started with your free account
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                data-testid="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className={`h-12 bg-slate-50/60 focus-visible:bg-white ${
                  errors.name ? 'border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/15' : ''
                }`}
              />
              {errors.name && (
                <span className="block text-[0.8125rem] font-medium text-red-600">{errors.name}</span>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`h-12 bg-slate-50/60 focus-visible:bg-white ${
                  errors.email ? 'border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/15' : ''
                }`}
              />
              {errors.email && (
                <span className="block text-[0.8125rem] font-medium text-red-600">{errors.email}</span>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`h-12 bg-slate-50/60 focus-visible:bg-white pr-12 ${
                    errors.password ? 'border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/15' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
              {errors.password && (
                <span className="block text-[0.8125rem] font-medium text-red-600">{errors.password}</span>
              )}
            </div>

            {errors.form && (
              <div className="sh-callout bg-red-50 border-red-200">
                <p className="text-red-700">{errors.form}</p>
              </div>
            )}

            <Button
              type="submit"
              data-testid="register-submit"
              disabled={loading}
              className="w-full h-12 rounded-xl text-[0.9375rem]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
