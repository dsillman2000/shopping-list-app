-- Delete any existing passwords (optional, remove if you want to keep multiple passwords)
DELETE FROM passwords;

-- Insert default password
INSERT INTO passwords (password) VALUES ('password');
