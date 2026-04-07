import { createClient } from '@supabase/supabase-js';
import process from 'process';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'cristiangomez0517@gmail.com',
    password: 'Noviembre0824@',
  });
  console.log('Login result:', { user: data.user?.id, error: error?.message });

  if (data.session) {
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id);
    console.log('Profile result:', { profile, error: profError });
  }
}

run();
