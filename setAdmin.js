import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Service Role Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setAdmin() {
  const email = '786universes@gmail.com';
  
  // 1. Get the user by email using auth admin API
  console.log(`Looking up user by email: ${email}...`);
  // Supabase Auth Admin API doesn't have a direct "getUserByEmail" that returns the user ID easily in JS sometimes, 
  // actually it does: listUsers or admin.getUserById, but wait. 
  // listUsers might work.
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }
  
  const user = usersData.users.find(u => u.email === email);
  if (!user) {
    console.error(`User with email ${email} not found.`);
    return;
  }
  
  console.log(`Found user: ${user.id}`);
  
  // 2. Update the role in the profiles table
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('user_id', user.id);
    
  if (updateError) {
    console.error('Error updating profile:', updateError);
  } else {
    console.log('Successfully updated role to admin!');
  }
}

setAdmin();
